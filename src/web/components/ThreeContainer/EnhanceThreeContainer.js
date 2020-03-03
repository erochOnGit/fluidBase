import React from "react";
import { compose, lifecycle, withHandlers, withState } from "recompose";
import Canvas3D from "./Canvas3D";

const ThreeContainer = props =>
  compose(
    lifecycle({
      componentDidMount() {
        let can3d = new Canvas3D({
          container: document.querySelector(".threeContainer"),
        });
      }
    })
  );

export default ThreeContainer;
