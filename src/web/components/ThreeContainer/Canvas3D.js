var OrbitControls = require("three-orbit-controls")(THREE);
import F2D from "../F2D";

class Canvas3D {
  constructor({ container }) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfefaab);
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.f2d = F2D;
    this.camera.position.z = 5;
    this.controls = new OrbitControls(this.camera);
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.autoClear = false;
    document.body.appendChild(this.renderer.domElement);
    container.appendChild(this.renderer.domElement);

    this.geometry = new THREE.PlaneBufferGeometry(1, 1);
    this.material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.plane = new THREE.Mesh(this.geometry, this.material);
    this.plane.rotation.x = this.plane.rotation.x + 0.7;
    this.plane.rotation.z = this.plane.rotation.x + 0.7;
    this.plane.rotation.y = this.plane.rotation.x - 0.7;
    this.scene.add(this.plane);
    console.log(this);
    requestAnimationFrame(this.animate.bind(this));
    this.f2d.main(this.renderer, this.scene /* this.camera*/);
  }
  animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.renderer.render(this.scene, this.camera);
    // console.log(this.scene)
  }
}

export default Canvas3D;
