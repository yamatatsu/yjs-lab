import * as Y from "yjs";
import { useState } from "react";
import "./App.css";

function App() {
  const [mapKey, setMapKey] = useState("");
  const [mapVal, setMapVal] = useState("");
  const [arrVal, setArrVal] = useState("");
  const { mapJson, arrJson, addMapItem, pushArrItem } = useYDoc();

  return (
    <div className="App">
      <h1>YJS Demo App</h1>
      <div>
        <input value={mapKey} onChange={(e) => setMapKey(e.target.value)} />
        <input value={mapVal} onChange={(e) => setMapVal(e.target.value)} />
        <button onClick={() => addMapItem(mapKey, mapVal)}>set to map</button>
      </div>
      <div>{JSON.stringify(mapJson, null, 2)}</div>
      <line></line>
      <div>
        <input value={arrVal} onChange={(e) => setArrVal(e.target.value)} />
        <button onClick={() => pushArrItem(arrVal)}>push to array</button>
      </div>
      <div>{JSON.stringify(arrJson, null, 2)}</div>
    </div>
  );
}

export default App;

const doc = new Y.Doc();
const map = doc.getMap<string>("my-map");
const arr = doc.getArray<string>("my-array");
const useYDoc = () => {
  const [mapJson, setMapJson] = useState<Record<string, string>>({});
  const [arrJson, setArrJson] = useState<string[]>([]);

  return {
    mapJson,
    arrJson,
    addMapItem: (key: string, val: string) => {
      map.set(key, val);
      setMapJson(map.toJSON());
    },
    pushArrItem: (val: string) => {
      arr.push([val]);
      setArrJson(arr.toArray());
    },
  };
};
