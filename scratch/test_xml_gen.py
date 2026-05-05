import json
from deeptutor.api.routers.whiteboard import _generate_mxgraph_xml, LogicalGraph

def test_xml_gen():
    # Complex-ish graph
    data = {
        "nodes": [
            {"id": "n1", "label": "Portfolio", "type": "rectangle"},
            {"id": "n2", "label": "Programs", "type": "rectangle"},
            {"id": "n3", "label": "Reports", "type": "database"},
            {"id": "n4", "label": "Gateway", "type": "cloud"}
        ],
        "edges": [
            {"source": "n1", "target": "n2", "label": "has"},
            {"source": "n2", "target": "n3", "label": "updates"},
            {"source": "n4", "target": "n1", "label": "accesses"}
        ]
    }
    
    graph = LogicalGraph.model_validate(data)
    xml = _generate_mxgraph_xml(graph)
    
    print("Generated XML:")
    print(xml)
    
    # Basic assertions
    assert "<mxGraphModel>" in xml
    assert "Portfolio" in xml
    assert "shape=cylinder3" in xml  # database type
    assert "shape=cloud" in xml      # cloud type
    assert 'source="2"' in xml       # internal ID mapping
    
    print("\nXML Generation Test Passed!")

if __name__ == "__main__":
    test_xml_gen()
