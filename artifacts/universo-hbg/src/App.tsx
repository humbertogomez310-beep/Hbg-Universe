import { useEffect } from "react";
import { Shell } from "./ui/Shell";
import { ownerSession } from "./core/ownerSession";
import "./styles/cyber.css";

export default function App() {
  useEffect(() => {
    void ownerSession.checkSession();
  }, []);

  return <Shell />;
}