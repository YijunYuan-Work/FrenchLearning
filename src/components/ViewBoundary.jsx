import { Component } from "react";

export class ViewBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="view-load-error" role="alert">
        <p>{this.props.message}</p>
        <button className="secondary-action" onClick={() => window.location.reload()} type="button">
          {this.props.reloadLabel}
        </button>
      </div>
    );
  }
}
