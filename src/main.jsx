import React, { Component } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Slimi Tasks failed to render", error, info);
  }

  render() {
    if (this.state.error) {
      return <main className="loading-screen"><section className="error-fallback"><span>🛠️</span><h1>Estamos arrumando uma coisinha</h1><p>Recarregue a página em instantes. Se continuar, fale com quem administra o Slimi Tasks.</p></section></main>;
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>
);
