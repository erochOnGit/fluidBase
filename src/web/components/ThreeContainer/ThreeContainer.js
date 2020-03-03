import React from "react";
import EnhanceThreeContainer from "./EnhanceThreeContainer";

const ThreeContainer = props => {
  return <div className="threeContainer" />;
};
// export default ThreeContainer;
export default EnhanceThreeContainer()(ThreeContainer);
