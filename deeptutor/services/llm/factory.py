"""
LLM Factory - Central Hub for LLM Calls
=======================================
This module serves as the central hub for all LLM calls in DeepTutor.
It provides a unified interface for agents to call LLMs, routing requests
to the appropriate provider (cloud or local) based on URL detection.

Compatibility:
    This factory preserves legacy behaviors from the pre-provider refactor,
    including BaseAgent.call_llm()/stream_llm() signatures and retry semantics.
    The adapter layer remains until all legacy entry points migrate to direct
    provider calls. Once all agents and tools depend on provider modules
    directly, this wrapper can be removed.

Architecture:
    Agents (ChatAgent, GuideAgent, etc.)
              ↓
         BaseAgent.call_llm() / stream_llm()
              ↓
         LLM Factory (this module)
              ↓
    ┌─────────┴─────────┐
    ↓                   ↓
CloudProvider      LocalProvider
(cloud_provider)   (local_provider)
              ↓                   ↓
OpenAI/DeepSeek/etc    LM Studio/Ollama/etc

Routing:
- Automatically routes to local_provider for local URLs (localhost, 127.0.0.1, etc.)
- Routes to cloud_provider for all other URLs

Retry Mechanism:
- Automatic retry with exponential backoff for transient errors
- Configurable max_retries, retry_delay, and exponential_backoff
- Only retries on retriable errors (timeout, rate limit, server errors)
"""

import asyncio
from collections.abc import AsyncGenerator, Mapping
from typing import TYPE_CHECKING, Any, TypedDict, cast

import tenacity

from deeptutor.config.settings import settings
from deeptutor.logging.logger import Logger, get_logger

from . import local_provider
from .config import LLMConfig, get_llm_config
from .exceptions import (
    LLMAPIError,
    LLMAuthenticationError,
    LLMConfigError,
    LLMRateLimitError,
    LLMTimeoutError,
)
from .executors import (
    sdk_complete,
    sdk_stream,
)
from .utils import is_local_llm_server

if TYPE_CHECKING:
    from .providers.base_provider import BaseLLMProvider

# Initialize logger
logger: Logger = get_logger("LLMFactory")

# Default retry configuration (bound to settings)
DEFAULT_MAX_RETRIES = settings.retry.max_retries
DEFAULT_RETRY_DELAY = settings.retry.base_delay
DEFAULT_EXPONENTIAL_BACKOFF = settings.retry.exponential_backoff

CallKwargs = dict[str, object]


def _is_retriable_error(error: BaseException) -> bool:
    """
    Check if an error is retriable.

    Retriable errors:
    - Timeout errors
    - Rate limit errors (429)
    - Server errors (5xx)
    - Network/connection errors

    Non-retriable errors:
    - CancelledError / KeyboardInterrupt (must propagate immediately)
    - Authentication errors (401)
    - Bad request (400)
    - Not found (404)
    - Client errors (4xx except 429)
    """
    if isinstance(error, (asyncio.CancelledError, KeyboardInterrupt, GeneratorExit)):
        return False

    from aiohttp import ClientError

    if isinstance(error, (asyncio.TimeoutError, ClientError)):
        return True
    if isinstance(error, LLMTimeoutError):
        return True
    if isinstance(error, LLMRateLimitError):
        return True
    if isinstance(error, LLMAuthenticationError):
        return False  # Don't retry auth errors
    if isinstance(error, LLMConfigError):
        return False

    if isinstance(error, LLMAPIError):
        status_code = error.status_code
        if status_code:
            # Retry on server errors (5xx) and rate limits (429)
            if status_code >= 500 or status_code == 429:
                return True
            # Don't retry on client errors (4xx except 429)
            if 400 <= status_code < 500:
                return False

        # When status_code is None (e.g. connection drop), retry.
        return True

    # For other exceptions (network errors, etc.), retry
    return True


def _should_use_local(base_url: str | None) -> bool:
    """
    Determine if we should use the local provider based on URL.

    Args:
        base_url: The base URL to check

    Returns:
        True if local provider should be used (localhost, 127.0.0.1, etc.)
    """
    return is_local_llm_server(base_url) if base_url else False


async def complete(
    prompt: str,
    system_prompt: str = "You are a helpful assistant.",
    model: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    api_version: str | None = None,
    binding: str | None = None,
    messages: list[dict[str, Any]] | None = None,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_delay: float = DEFAULT_RETRY_DELAY,
    exponential_backoff: bool = DEFAULT_EXPONENTIAL_BACKOFF,
    **kwargs: object,
) -> str:
    """
    Unified LLM completion function with automatic retry.

    Routes to cloud_provider or local_provider based on configuration.
    Includes automatic retry with exponential backoff for transient errors.

    Args:
        prompt: The user prompt
        system_prompt: System prompt for context
        model: Model name (optional, uses effective config if not provided)
        api_key: API key (optional)
        base_url: Base URL for the API (optional)
        api_version: API version for Azure OpenAI (optional)
        binding: Provider binding type (optional)
        messages: Pre-built messages array (optional)
        max_retries: Maximum number of retry attempts (default: 5)
        retry_delay: Initial delay between retries in seconds (default: 2.0)
        exponential_backoff: Whether to use exponential backoff (default: True)
        **kwargs: Additional parameters (temperature, max_tokens, etc.)

    Returns:
        str: The LLM response
    """
    # 1. Resolve defaults from config first
    config = get_llm_config()
    eff_model = model or config.model
    eff_api_key = api_key if api_key is not None else config.api_key
    eff_base_url = base_url or config.base_url
    eff_api_version = api_version or config.api_version
    eff_binding = binding or config.binding or "openai"

    # 2. Dynamic provider auto-detection when a custom model is passed
    if model:
        from .provider_registry import find_by_model
        import os
        spec = find_by_model(model)
        if spec:
            model_prefix = model.lower().split("/", 1)[0].replace("-", "_") if "/" in model else ""
            is_explicit = (model_prefix == spec.name)
            is_currently_local = _should_use_local(eff_base_url)
            
            # Only hijack if explicitly prefixed (e.g. nvidia/nemotron) OR if we are not currently pointing to a local provider.
            if (is_explicit or not is_currently_local) and (spec.name != eff_binding):
                eff_binding = spec.name
                eff_base_url = spec.default_api_base
                eff_api_key = os.getenv(spec.env_key) or eff_api_key
                if hasattr(spec, "api_version") and getattr(spec, "api_version", None):
                    eff_api_version = spec.api_version

    provider_name = eff_binding
    provider_mode = "standard"
    extra_headers: dict[str, str] = getattr(config, "extra_headers", {}) or {}
    reasoning_effort = cast("str | None", kwargs.pop("reasoning_effort", getattr(config, "reasoning_effort", None)))

    from .provider_registry import find_by_name
    spec = find_by_name(provider_name)
    if spec is not None:
        provider_mode = spec.mode

    use_local_fallback = _should_use_local(eff_base_url)

    def _is_retriable_llm_api_error(exc: BaseException) -> bool:
        """Delegate retriable checks to shared helper."""
        return _is_retriable_error(exc)

    def _log_retry_warning(retry_state: tenacity.RetryCallState) -> None:
        """Log retry warnings with safe handling for missing exceptions."""
        outcome = retry_state.outcome
        exception = outcome.exception() if outcome else None
        error_message = str(exception) if exception else "unknown error"
        if not error_message.strip():
            error_message = f"{type(exception).__name__} (no message)"
        logger.warning(
            "LLM call failed (attempt %s/%s), retrying in %.1fs... Error: %s"
            % (
                retry_state.attempt_number,
                max_retries + 1,
                retry_state.upcoming_sleep,
                error_message,
            )
        )

    wait_strategy = (
        tenacity.wait_exponential(
            multiplier=retry_delay,
            min=retry_delay,
            max=120,
        )
        if exponential_backoff
        else tenacity.wait_fixed(retry_delay)
    )

    total_attempts = max_retries + 1

    @tenacity.retry(
        retry=(
            tenacity.retry_if_exception_type(LLMRateLimitError)
            | tenacity.retry_if_exception_type(LLMTimeoutError)
            | tenacity.retry_if_exception(_is_retriable_llm_api_error)
        ),
        wait=wait_strategy,
        stop=tenacity.stop_after_attempt(total_attempts),
        before_sleep=_log_retry_warning,
    )
    async def _do_complete(
        *,
        prompt_value: str,
        system_prompt_value: str,
        model_value: str,
        api_key_value: str | None,
        base_url_value: str | None,
        api_version_value: str | None,
        binding_value: str | None,
        extra_kwargs: CallKwargs,
        messages_value: list[dict[str, str]] | None,
    ) -> str:
        try:
            if provider_mode == "oauth" and provider_name == "openai_codex":
                raise LLMConfigError(
                    "openai_codex requires OAuth login in CLI. "
                    "Run `deeptutor provider login openai-codex` first."
                )
            if provider_mode == "oauth":
                raise LLMConfigError(
                    f"{provider_name} requires OAuth session. "
                    "Run `deeptutor provider login ...` first."
                )
            if provider_mode != "direct":
                return await sdk_complete(
                    prompt=prompt_value,
                    system_prompt=system_prompt_value,
                    provider_name=provider_name,
                    model=model_value,
                    api_key=api_key_value,
                    base_url=base_url_value,
                    api_version=api_version_value,
                    messages=messages_value,
                    extra_headers=extra_headers or None,
                    reasoning_effort=reasoning_effort,
                    **extra_kwargs,
                )

            if use_local_fallback:
                return await local_provider.complete(
                    prompt=prompt_value,
                    system_prompt=system_prompt_value,
                    model=model_value,
                    api_key=api_key_value,
                    base_url=base_url_value,
                    messages=messages_value,
                    **extra_kwargs,
                )
            from . import cloud_provider

            direct_binding = "azure_openai" if provider_name == "azure_openai" else "openai"
            return await cloud_provider.complete(
                prompt=prompt_value,
                system_prompt=system_prompt_value,
                model=model_value,
                api_key=api_key_value,
                base_url=base_url_value,
                api_version=api_version_value,
                binding=direct_binding if provider_mode == "direct" else (binding_value or "openai"),
                messages=messages_value,
                extra_headers=extra_headers or None,
                **extra_kwargs,
            )
        except Exception as exc:
            if isinstance(exc, LLMConfigError):
                raise
            from .error_mapping import map_error

            provider_for_error = provider_name
            if use_local_fallback and provider_mode != "direct":
                provider_for_error = "local"
            mapped_error = map_error(exc, provider=provider_for_error)
            raise mapped_error from exc

    extra_kwargs: CallKwargs = dict(kwargs)
    extra_kwargs.pop("messages", None)
    extra_kwargs.pop("extra_headers", None)

    return await _do_complete(
        prompt_value=prompt,
        system_prompt_value=system_prompt,
        model_value=eff_model,
        api_key_value=eff_api_key,
        base_url_value=eff_base_url,
        api_version_value=eff_api_version,
        binding_value=eff_binding,
        extra_kwargs=extra_kwargs,
        messages_value=messages,
    )


async def stream(
    prompt: str,
    system_prompt: str = "You are a helpful assistant.",
    model: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    api_version: str | None = None,
    binding: str | None = None,
    messages: list[dict[str, object]] | None = None,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_delay: float = DEFAULT_RETRY_DELAY,
    exponential_backoff: bool = DEFAULT_EXPONENTIAL_BACKOFF,
    **kwargs: object,
) -> AsyncGenerator[str, None]:
    """Stream LLM responses with retry handling."""
    # 1. Resolve defaults from config first
    config = get_llm_config()
    eff_model = model or config.model
    eff_api_key = api_key if api_key is not None else config.api_key
    eff_base_url = base_url or config.base_url
    eff_api_version = api_version or config.api_version
    eff_binding = binding or config.binding or "openai"

    # 2. Dynamic provider auto-detection when a custom model is passed
    if model:
        from .provider_registry import find_by_model
        import os
        spec = find_by_model(model)
        if spec:
            model_prefix = model.lower().split("/", 1)[0].replace("-", "_") if "/" in model else ""
            is_explicit = (model_prefix == spec.name)
            is_currently_local = _should_use_local(eff_base_url)
            
            # Only hijack if explicitly prefixed OR if we are not currently pointing to a local provider.
            if (is_explicit or not is_currently_local) and (spec.name != eff_binding):
                eff_binding = spec.name
                eff_base_url = spec.default_api_base
                eff_api_key = os.getenv(spec.env_key) or eff_api_key
                if hasattr(spec, "api_version") and getattr(spec, "api_version", None):
                    eff_api_version = spec.api_version

    provider_name = eff_binding
    provider_mode = "standard"
    extra_headers: dict[str, str] = getattr(config, "extra_headers", {}) or {}
    reasoning_effort = cast("str | None", kwargs.pop("reasoning_effort", getattr(config, "reasoning_effort", None)))

    from .provider_registry import find_by_name
    spec = find_by_name(provider_name)
    if spec is not None:
        provider_mode = spec.mode

    use_local_fallback = _should_use_local(eff_base_url)
    extra_kwargs: CallKwargs = dict(kwargs)
    extra_kwargs.pop("messages", None)
    extra_kwargs.pop("extra_headers", None)

    total_attempts = max_retries + 1
    last_exception: Exception | None = None
    delay = retry_delay
    has_yielded = False
    max_delay = 120

    for attempt in range(total_attempts):
        try:
            if provider_mode == "oauth" and provider_name == "openai_codex":
                raise LLMConfigError(
                    "openai_codex requires OAuth login in CLI. "
                    "Run `deeptutor provider login openai-codex` first."
                )
            if provider_mode == "oauth":
                raise LLMConfigError(
                    f"{provider_name} requires OAuth session. "
                    "Run `deeptutor provider login ...` first."
                )

            if provider_mode != "direct":
                async for chunk in sdk_stream(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    provider_name=provider_name,
                    model=eff_model,
                    api_key=eff_api_key,
                    base_url=eff_base_url,
                    api_version=eff_api_version,
                    messages=messages,
                    extra_headers=extra_headers or None,
                    reasoning_effort=reasoning_effort,
                    **extra_kwargs,
                ):
                    has_yielded = True
                    yield chunk
            elif use_local_fallback:
                async for chunk in local_provider.stream(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    model=eff_model,
                    api_key=eff_api_key,
                    base_url=eff_base_url,
                    messages=messages,
                    **extra_kwargs,
                ):
                    has_yielded = True
                    yield chunk
            else:
                from . import cloud_provider

                direct_binding = "azure_openai" if provider_name == "azure_openai" else "openai"
                async for chunk in cloud_provider.stream(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    model=eff_model,
                    api_key=eff_api_key,
                    base_url=eff_base_url,
                    api_version=eff_api_version,
                    binding=direct_binding if provider_mode == "direct" else eff_binding,
                    messages=messages,
                    extra_headers=extra_headers or None,
                    **extra_kwargs,
                ):
                    has_yielded = True
                    yield chunk
            return
        except Exception as exc:
            last_exception = exc
            if has_yielded:
                raise
            if attempt >= max_retries or not _is_retriable_error(exc):
                raise

            if exponential_backoff:
                current_delay = min(delay * (2**attempt), max_delay)
            else:
                current_delay = delay

            if isinstance(exc, LLMRateLimitError) and exc.retry_after:
                current_delay = max(current_delay, exc.retry_after)

            logger.warning(
                "LLM streaming failed (attempt %s/%s), retrying in %.1fs... Error: %s"
                % (attempt + 1, total_attempts, current_delay, exc)
            )
            await asyncio.sleep(current_delay)

    if last_exception:
        raise last_exception


async def fetch_models(
    binding: str,
    base_url: str,
    api_key: str | None = None,
) -> list[str]:
    """
    Fetch available models from the provider.

    Routes to cloud_provider or local_provider based on URL.

    Args:
        binding: Provider type (openai, ollama, etc.)
        base_url: API endpoint URL
        api_key: API key (optional for local providers)

    Returns:
        List of available model names
    """
    if is_local_llm_server(base_url):
        return await local_provider.fetch_models(base_url, api_key)
    else:
        from . import cloud_provider

        return await cloud_provider.fetch_models(base_url, api_key, binding)


class ApiProviderPreset(TypedDict, total=False):
    """Typed representation of API provider presets."""

    name: str
    base_url: str
    requires_key: bool
    models: list[str]
    binding: str


class LocalProviderPreset(TypedDict, total=False):
    """Typed representation of local provider presets."""

    name: str
    base_url: str
    requires_key: bool
    default_key: str


ProviderPreset = ApiProviderPreset | LocalProviderPreset
ProviderPresetMap = Mapping[str, ProviderPreset]
ProviderPresetBundle = Mapping[str, ProviderPresetMap]


# API Provider Presets
API_PROVIDER_PRESETS: dict[str, ApiProviderPreset] = {
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "requires_key": True,
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    },
    "anthropic": {
        "name": "Anthropic",
        "base_url": "https://api.anthropic.com/v1",
        "requires_key": True,
        "binding": "anthropic",
        "models": ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"],
    },
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com",
        "requires_key": True,
        "models": ["deepseek-chat", "deepseek-reasoner"],
    },
    "openrouter": {
        "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "requires_key": True,
        "models": [],
    },
}

# Local Provider Presets
LOCAL_PROVIDER_PRESETS: dict[str, LocalProviderPreset] = {
    "ollama": {
        "name": "Ollama",
        "base_url": "http://localhost:11434/v1",
        "requires_key": False,
        "default_key": "ollama",
    },
    "lm_studio": {
        "name": "LM Studio",
        "base_url": "http://localhost:1234/v1",
        "requires_key": False,
        "default_key": "lm-studio",
    },
    "vllm": {
        "name": "vLLM",
        "base_url": "http://localhost:8000/v1",
        "requires_key": False,
        "default_key": "vllm",
    },
    "llama_cpp": {
        "name": "llama.cpp",
        "base_url": "http://localhost:8080/v1",
        "requires_key": False,
        "default_key": "llama-cpp",
    },
}


def get_provider_presets() -> ProviderPresetBundle:
    """
    Get all provider presets for frontend display.
    """
    return {
        "api": API_PROVIDER_PRESETS,
        "local": LOCAL_PROVIDER_PRESETS,
    }


__all__ = [
    "complete",
    "stream",
    "fetch_models",
    "get_provider_presets",
    "API_PROVIDER_PRESETS",
    "LOCAL_PROVIDER_PRESETS",
    # Retry configuration defaults
    "DEFAULT_MAX_RETRIES",
    "DEFAULT_RETRY_DELAY",
    "DEFAULT_EXPONENTIAL_BACKOFF",
    "LLMFactory",
]


class LLMFactory:
    """Compatibility factory for legacy agent integrations."""

    @staticmethod
    def get_provider(config: "LLMConfig") -> "BaseLLMProvider":
        """Return a provider instance for the supplied config."""
        from .providers.routing import RoutingProvider

        return RoutingProvider(config)
