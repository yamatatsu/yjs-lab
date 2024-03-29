import * as Y from "yjs";
import { useEffect, useState } from "react";
import { WebsocketProvider } from "y-websocket-for-aws-apigateway";
import { MonacoBinding } from "y-monaco";
import Editor from "@monaco-editor/react";

function App() {
  const [mapKey, setMapKey] = useState("");
  const [mapVal, setMapVal] = useState("");
  const [arrVal, setArrVal] = useState("");
  const {
    mapJson,
    arrJson,
    setMapItem,
    deleteMapItem,
    pushArrItem,
    popArrItem,
    undoMap,
    redoMap,
    undoArr,
    redoArr,
  } = useYDoc();

  return (
    <div className="App">
      <h1>YJS Demo App</h1>

      <h2>Map</h2>
      <div>
        <input value={mapKey} onChange={(e) => setMapKey(e.target.value)} />
        <input value={mapVal} onChange={(e) => setMapVal(e.target.value)} />
      </div>
      <div>
        <button onClick={() => setMapItem(mapKey, mapVal)}>set</button>
        <button onClick={() => deleteMapItem(mapKey)}>delete</button>
      </div>
      <div>
        <button onClick={undoMap}>undo</button>
        <button onClick={redoMap}>redo</button>
      </div>
      <div>{JSON.stringify(mapJson, null, 2)}</div>

      <h2>Array</h2>
      <div>
        <input value={arrVal} onChange={(e) => setArrVal(e.target.value)} />
      </div>
      <div>
        <button onClick={() => pushArrItem(arrVal)}>push</button>
        <button onClick={popArrItem}>pop</button>
      </div>
      <div>
        <button onClick={undoArr}>undo</button>
        <button onClick={redoArr}>redo</button>
      </div>
      <div>{JSON.stringify(arrJson, null, 2)}</div>

      <h2>Text</h2>
      <Editor
        height="300px"
        theme="vs-dark"
        defaultLanguage="javascript"
        options={{
          minimap: { enabled: false },
          lineNumbers: "off",
        }}
        onMount={(editor, monaco) => {
          const model = editor.getModel();
          if (!model) {
            throw new Error("No model is mounted");
          }
          const monacoBinding = new MonacoBinding(
            txt,
            model,
            new Set([editor]),
            wsProvider.awareness
          );
        }}
      />
    </div>
  );
}

export default App;

const doc = new Y.Doc();
const url = "wss://ijxmnnebka.execute-api.ap-northeast-1.amazonaws.com/dev/";
const token = import.meta.env.VITE_WEBSOCKET_TOKEN;
const docId = "web-client-doc";
const wsProvider = new WebsocketProvider(url, docId, doc, {
  subprotocols: [token],
  disableBc: true,
});

const map = doc.getMap<string>("my-map");
const arr = doc.getArray<string>("my-array");
const txt = doc.getText("my-text");
const mapUndoManager = new Y.UndoManager(map);
const arrUndoManager = new Y.UndoManager(arr);

const useYDoc = () => {
  const [mapJson, setMapJson] = useState<Record<string, string>>(map.toJSON());
  const [arrJson, setArrJson] = useState<string[]>(arr.toArray());

  useEffect(() => {
    const handleUpdate = () => {
      setMapJson(map.toJSON());
      setArrJson(arr.toArray());
    };
    doc.on("update", handleUpdate);
    return () => {
      doc.off("update", handleUpdate);
    };
  });

  return {
    mapJson,
    arrJson,
    setMapItem: (key: string, val: string) => {
      map.set(key, val);
    },
    deleteMapItem: (key: string) => {
      map.delete(key);
    },
    pushArrItem: (val: string) => {
      arr.push([val]);
    },
    popArrItem: () => {
      if (arr.length === 0) return;
      arr.delete(arr.length - 1);
    },
    undoMap: () => {
      mapUndoManager.undo();
    },
    redoMap: () => {
      mapUndoManager.redo();
    },
    undoArr: () => {
      arrUndoManager.undo();
    },
    redoArr: () => {
      arrUndoManager.redo();
    },
  };
};
