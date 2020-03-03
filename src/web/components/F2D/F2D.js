var F2D = F2D === undefined ? {} : F2D;
import * as dat from "dat.gui";

import advect from "src/web/asset/shaders/advect.fs";
import basic from "src/web/asset/shaders/basic.vs";
import gradient from "src/web/asset/shaders/gradient.fs";
import jacobiscalar from "src/web/asset/shaders/jacobiscalar.fs";
import jacobivector from "src/web/asset/shaders/jacobivector.fs";
import displayscalar from "src/web/asset/shaders/displayscalar.fs";
import displayvector from "src/web/asset/shaders/displayvector.fs";
import divergence from "src/web/asset/shaders/divergence.fs";
import splat from "src/web/asset/shaders/splat.fs";
import vorticity from "src/web/asset/shaders/vorticity.fs";
import vorticityforce from "src/web/asset/shaders/vorticityforce.fs";
import boundary from "src/web/asset/shaders/boundary.fs";

(function(F2D) {
  ("use strict");
  F2D.SlabopBase = function(fs, uniforms, grid) {
    var geometry = new THREE.PlaneBufferGeometry(
      (2 * (grid.size.x - 2)) / grid.size.x,
      (2 * (grid.size.y - 2)) / grid.size.y
    );
    var material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      fragmentShader: fs,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NoBlending
    });
    var quad = new THREE.Mesh(geometry, material);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.scene.add(quad);
  };

  F2D.SlabopBase.prototype = {
    constructor: F2D.SlabopBase
  };

  F2D.Advect = function(fs, grid, time, dissipation) {
    this.grid = grid;
    this.time = time;
    this.dissipation = dissipation === undefined ? 0.998 : dissipation;

    this.uniforms = {
      velocity: {
        type: "t"
      },
      advected: {
        type: "t"
      },
      gridSize: { type: "v2", value: new THREE.Vector2() },
      gridScale: {
        type: "f",
        value: 0
      },
      timestep: {
        type: "f",
        value: 0
      },
      dissipation: {
        type: "f",
        value: 0
      }
    };

    F2D.SlabopBase.call(this, fs, this.uniforms, grid);
  };

  F2D.Advect.prototype = Object.create(F2D.SlabopBase.prototype);
  F2D.Advect.prototype.constructor = F2D.Advect;

  F2D.Advect.prototype.compute = function(
    renderer,
    velocity,
    advected,
    output
  ) {
    this.uniforms.velocity.value = velocity.read;
    this.uniforms.advected.value = advected.read;
    this.uniforms.gridSize.value = this.grid.size;
    this.uniforms.gridScale.value = this.grid.scale;
    this.uniforms.timestep.value = this.time.step;
    this.uniforms.dissipation.value = this.dissipation;

    renderer.setRenderTarget(output.write);
    renderer.render(this.scene, this.camera);
    renderer.clear();
    output.swap();
  };

  F2D.Boundary = function(fs, grid) {
    this.grid = grid;

    this.uniforms = {
      read: {
        type: "t"
      },
      gridSize: {
        type: "v2",
        value: new THREE.Vector2()
      },
      gridOffset: {
        type: "v2",
        value: new THREE.Vector2()
      },
      scale: {
        type: "f",
        value: 0
      }
    };
    var material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      fragmentShader: fs,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NoBlending
    });

    var createLine = function(positions) {
      var vertices = new Float32Array(positions.length * 3);
      for (var i = 0; i < positions.length; i++) {
        vertices[i * 3] = positions[i][0];
        vertices[i * 3 + 1] = positions[i][1];
        vertices[i * 3 + 2] = positions[i][2];
      }

      var geometry = new THREE.BufferGeometry();
      geometry.addAttribute("position", new THREE.BufferAttribute(vertices, 3));

      return new THREE.Line(geometry, material);
    };

    var ax = (this.grid.size.x - 2) / this.grid.size.x;
    var ay = (this.grid.size.y - 2) / this.grid.size.y;
    var bx = (this.grid.size.x - 1) / this.grid.size.x;
    var by = (this.grid.size.y - 1) / this.grid.size.y;

    this.lineL = createLine([
      [-ax, -ay, 0],
      [-bx, by, 0]
    ]);
    this.lineR = createLine([
      [ax, -ay, 0],
      [bx, by, 0]
    ]);
    this.lineB = createLine([
      [-ax, -ay, 0],
      [bx, -by, 0]
    ]);
    this.lineT = createLine([
      [-ax, ay, 0],
      [bx, by, 0]
    ]);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();

    this.gridOffset = new THREE.Vector3();
  };

  F2D.Boundary.prototype = {
    constructor: F2D.Boundary,

    compute: function(renderer, input, scale, output) {
      if (!this.grid.applyBoundaries) return;

      this.uniforms.read.value = input.read;
      this.uniforms.gridSize.value = this.grid.size;
      this.uniforms.scale.value = scale;

      this.renderLine(renderer, this.lineL, [1, 0], output);
      this.renderLine(renderer, this.lineR, [-1, 0], output);
      this.renderLine(renderer, this.lineB, [0, 1], output);
      this.renderLine(renderer, this.lineT, [0, -1], output);
    },

    renderLine: function(renderer, line, offset, output) {
      this.scene.add(line);
      this.gridOffset.set(offset[0], offset[1]);
      this.uniforms.gridOffset.value = this.gridOffset;
      renderer.setRenderTarget(output.write);
      renderer.clear();
      renderer.render(this.scene, this.camera);
      this.scene.remove(line);
      // we do not swap output, the next slab operation will fill in the
      // iterior and swap it
    }
  };

  F2D.Divergence = function(fs, grid) {
    this.grid = grid;

    this.uniforms = {
      velocity: {
        type: "t"
      },
      gridSize: {
        type: "v2",
        value: new THREE.Vector2()
      },
      gridScale: {
        type: "f",
        value: 0
      }
    };

    F2D.SlabopBase.call(this, fs, this.uniforms, grid);
  };

  F2D.Divergence.prototype = Object.create(F2D.SlabopBase.prototype);
  F2D.Divergence.prototype.constructor = F2D.Divergence;

  F2D.Divergence.prototype.compute = function(renderer, velocity, divergence) {
    this.uniforms.velocity.value = velocity.read;
    this.uniforms.gridSize.value = this.grid.size;
    this.uniforms.gridScale.value = this.grid.scale;
    renderer.setRenderTarget(divergence.write);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    divergence.swap();
  };

  F2D.Gradient = function(fs, grid) {
    this.grid = grid;

    this.uniforms = {
      p: {
        type: "t"
      },
      w: {
        type: "t"
      },
      gridSize: {
        type: "v2",
        value: new THREE.Vector2()
      },
      gridScale: {
        type: "f",
        value: 0
      }
    };

    F2D.SlabopBase.call(this, fs, this.uniforms, grid);
  };

  F2D.Gradient.prototype = Object.create(F2D.SlabopBase.prototype);
  F2D.Gradient.prototype.constructor = F2D.Gradient;

  F2D.Gradient.prototype.compute = function(renderer, p, w, output) {
    this.uniforms.p.value = p.read;
    this.uniforms.w.value = w.read;
    this.uniforms.gridSize.value = this.grid.size;
    this.uniforms.gridScale.value = this.grid.scale;
    renderer.setRenderTarget(output.write);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    output.swap();
  };

  F2D.Jacobi = function(fs, grid, iterations, alpha, beta) {
    this.grid = grid;
    this.iterations = iterations === undefined ? 50 : iterations;
    this.alpha = alpha === undefined ? -1 : alpha;
    this.beta = beta === undefined ? 4 : beta;

    this.uniforms = {
      x: {
        type: "t"
      },
      b: {
        type: "t"
      },
      gridSize: {
        type: "v2",
        value: new THREE.Vector2()
      },
      alpha: {
        type: "f",
        value: 0
      },
      beta: {
        type: "f",
        value: 0
      }
    };

    F2D.SlabopBase.call(this, fs, this.uniforms, grid);
  };

  F2D.Jacobi.prototype = Object.create(F2D.SlabopBase.prototype);
  F2D.Jacobi.prototype.constructor = F2D.Jacobi;

  F2D.Jacobi.prototype.compute = function(
    renderer,
    x,
    b,
    output,
    boundary,
    scale
  ) {
    for (var i = 0; i < this.iterations; i++) {
      this.step(renderer, x, b, output);
      boundary.compute(renderer, output, scale, output);
    }
  };

  F2D.Jacobi.prototype.step = function(renderer, x, b, output) {
    this.uniforms.x.value = x.read;
    this.uniforms.b.value = b.read;
    this.uniforms.gridSize.value = this.grid.size;
    this.uniforms.alpha.value = this.alpha;
    this.uniforms.beta.value = this.beta;
    renderer.setRenderTarget(output.write);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    output.swap();
  };

  F2D.Splat = function(fs, grid, radius) {
    this.grid = grid;
    this.radius = radius === undefined ? 0.01 : radius;

    this.uniforms = {
      read: {
        type: "t"
      },
      gridSize: {
        type: "v2",
        value: new THREE.Vector2()
      },
      color: {
        type: "v3",
        value: new THREE.Vector3()
      },
      point: {
        type: "v2",
        value: new THREE.Vector2()
      },
      radius: {
        type: "f",
        value: 0
      }
    };

    F2D.SlabopBase.call(this, fs, this.uniforms, grid);
  };

  F2D.Splat.prototype = Object.create(F2D.SlabopBase.prototype);
  F2D.Splat.prototype.constructor = F2D.Splat;

  F2D.Splat.prototype.compute = function(
    renderer,
    input,
    color,
    point,
    output
  ) {
    this.uniforms.gridSize.value = this.grid.size;
    this.uniforms.read.value = input.read;
    this.uniforms.color.value = color;
    this.uniforms.point.value = point;
    this.uniforms.radius.value = this.radius;
    renderer.setRenderTarget(output.write);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    output.swap();
  };

  F2D.Vorticity = function(fs, grid) {
    this.grid = grid;

    this.uniforms = {
      velocity: {
        type: "t"
      },
      gridSize: {
        type: "v2",
        value: new THREE.Vector2()
      },
      gridScale: {
        type: "f",
        value: 0
      }
    };

    F2D.SlabopBase.call(this, fs, this.uniforms, grid);
  };

  F2D.Vorticity.prototype = Object.create(F2D.SlabopBase.prototype);
  F2D.Vorticity.prototype.constructor = F2D.Vorticity;

  F2D.Vorticity.prototype.compute = function(renderer, velocity, output) {
    this.uniforms.velocity.value = velocity.read;
    this.uniforms.gridSize.value = this.grid.size;
    this.uniforms.gridScale.value = this.grid.scale;
    renderer.setRenderTarget(output.write);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    output.swap();
  };

  F2D.VorticityConfinement = function(fs, grid, time, epsilon, curl) {
    this.grid = grid;
    this.time = time;
    this.epsilon = epsilon === undefined ? 2.4414e-4 : epsilon;
    this.curl = curl === undefined ? 0.3 : curl;

    this.uniforms = {
      velocity: {
        type: "t"
      },
      vorticity: {
        type: "t"
      },
      gridSize: {
        type: "v2",
        value: new THREE.Vector2()
      },
      gridScale: {
        type: "f",
        value: 0
      },
      timestep: {
        type: "f",
        value: 0
      },
      epsilon: {
        type: "f",
        value: 0
      },
      curl: {
        type: "v2",
        value: new THREE.Vector2()
      }
    };

    F2D.SlabopBase.call(this, fs, this.uniforms, grid);
  };

  F2D.VorticityConfinement.prototype = Object.create(F2D.SlabopBase.prototype);
  F2D.VorticityConfinement.prototype.constructor = F2D.VorticityConfinement;

  F2D.VorticityConfinement.prototype.compute = function(
    renderer,
    velocity,
    vorticity,
    output
  ) {
    this.uniforms.velocity.value = velocity.read;
    this.uniforms.vorticity.value = vorticity.read;
    this.uniforms.gridSize.value = this.grid.size;
    this.uniforms.gridScale.value = this.grid.scale;
    this.uniforms.timestep.value = this.time.step;
    this.uniforms.epsilon.value = this.epsilon;
    this.uniforms.curl.value.set(
      this.curl * this.grid.scale,
      this.curl * this.grid.scale
    );
    renderer.setRenderTarget(output.write);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    output.swap();
  };

  F2D.Display = function(camera, scene, vs, fs, bias, scale) {
    this.bias = bias === undefined ? new THREE.Vector3(0, 0, 0) : bias;
    this.scale = scale === undefined ? new THREE.Vector3(1, 1, 1) : scale;

    this.uniforms = {
      read: {
        type: "t"
      },
      bias: {
        type: "v3",
        value: new THREE.Vector3()
      },
      scale: {
        type: "v3",
        value: new THREE.Vector3()
      }
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vs,
      fragmentShader: fs,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NoBlending
    });
    var quad = new THREE.Mesh(
      new THREE.PlaneBufferGeometry(2, 2),
      this.material
    );

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    // console.log(scene);
    // scene.add(quad);
    // console.log(quad.position);
    this.scene.add(quad);
  };

  F2D.Display.prototype = {
    constructor: F2D.Display,

    // set bias and scale for including range of negative values
    scaleNegative: function() {
      var v = 0.5;
      this.bias.set(v, v, v);
      this.scale.set(v, v, v);
    },

    render: function(renderer, read) {
      this.uniforms.read.value = read;
      this.uniforms.bias.value = this.bias;
      this.uniforms.scale.value = this.scale;
      renderer.render(this.scene, this.camera);
    }
  };

  // Construct a file loader with a suffix path that is prepended to all
  // names.
  F2D.FileLoader = function(path, names) {
    this.path = path;
    this.queue = [];
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var url = path + "/" + name;
      var file = {
        name: name,
        url: url
      };
      this.queue.push(file);
    }
  };

  F2D.FileLoader.prototype = {
    constructor: F2D.FileLoader,

    // Load all files currently in the queue, calls onDone when all files
    // has been downloaded.
    run: function(onDone) {
      var files = {};
      var filesRemaining = this.queue.length;

      var fileLoaded = function(file) {
        files[file.name] = file.text;
        filesRemaining--;
        if (filesRemaining === 0) {
          onDone(files);
        }
      };

      var loadFile = function(file) {
        var request = new XMLHttpRequest();
        request.onload = function() {
          if (request.status === 200) {
            file.text = request.responseText;
          }
          fileLoaded(file);
        };
        request.open("GET", file.url, true);
        request.send();
      };

      for (var i = 0; i < this.queue.length; i++) {
        loadFile(this.queue[i]);
      }
      this.queue = [];
    }
  };

  F2D.Mouse = function(grid) {
    this.grid = grid;

    this.left = false;
    this.right = false;
    this.position = new THREE.Vector2();
    this.motions = [];

    document.addEventListener("mousedown", this.mouseDown.bind(this), false);
    document.addEventListener("mouseup", this.mouseUp.bind(this), false);
    document.addEventListener("mousemove", this.mouseMove.bind(this), false);
    document.addEventListener(
      "contextmenu",
      this.contextMenu.bind(this),
      false
    );
  };

  F2D.Mouse.prototype = {
    constructor: F2D.Mouse,

    mouseDown: function(event) {
      this.position.set(event.clientX, event.clientY);
      this.left = event.button === 0 ? true : this.left;
      this.right = event.button === 2 ? true : this.right;
    },

    mouseUp: function(event) {
      event.preventDefault();
      this.left = event.button === 0 ? false : this.left;
      this.right = event.button === 2 ? false : this.right;
    },

    mouseMove: function(event) {
      event.preventDefault();
      var r = this.grid.scale;

      var x = event.clientX;
      var y = event.clientY;

      if (this.left || this.right) {
        var dx = x - this.position.x;
        var dy = y - this.position.y;

        var drag = {
          x: Math.min(Math.max(dx, -r), r),
          y: Math.min(Math.max(dy, -r), r)
        };

        var position = {
          x: x,
          y: y
        };

        this.motions.push({
          left: this.left,
          right: this.right,
          drag: drag,
          position: position
        });
      }

      this.position.set(x, y);
    },

    contextMenu: function(event) {
      event.preventDefault();
    }
  };

  F2D.Slab = function(width, height, options) {
    this.read = new THREE.WebGLRenderTarget(width, height, options);
    this.write = this.read.clone();
  };

  F2D.Slab.prototype = {
    constructor: F2D.Slab,

    swap: function() {
      var tmp = this.read;
      this.read = this.write;
      this.write = tmp;
    }
  };

  var options = {
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    shareDepthFrom: null
  };

  F2D.Slab.make = function(width, height) {
    return new F2D.Slab(width, height, options);
  };

  F2D.Solver = function(grid, time, windowSize, slabs, slabop) {
    this.grid = grid;
    this.time = time;
    this.windowSize = windowSize;

    // slabs
    this.velocity = slabs.velocity;
    this.density = slabs.density;
    this.velocityDivergence = slabs.velocityDivergence;
    this.velocityVorticity = slabs.velocityVorticity;
    this.pressure = slabs.pressure;

    // slab operations
    this.advect = slabop.advect;
    this.diffuse = slabop.diffuse;
    this.divergence = slabop.divergence;
    this.poissonPressureEq = slabop.poissonPressureEq;
    this.gradient = slabop.gradient;
    this.splat = slabop.splat;
    this.vorticity = slabop.vorticity;
    this.vorticityConfinement = slabop.vorticityConfinement;
    this.boundary = slabop.boundary;

    this.viscosity = 0.3;
    this.applyViscosity = false;
    this.applyVorticity = false;

    // density attributes
    this.source = new THREE.Vector3(0.8, 0.0, 0.0);
    this.ink = new THREE.Vector3(0.0, 0.06, 0.19);
  };

  F2D.Solver.prototype = {
    constructor: F2D.Solver,

    step: function(renderer, mouse) {
      // we only want the quantity carried by the velocity field to be
      // affected by the dissipation
      var temp = this.advect.dissipation;
      this.advect.dissipation = 1;
      this.advect.compute(
        renderer,
        this.velocity,
        this.velocity,
        this.velocity
      );
      this.boundary.compute(renderer, this.velocity, -1, this.velocity);

      this.advect.dissipation = temp;
      this.advect.compute(renderer, this.velocity, this.density, this.density);

      this.addForces(renderer, mouse);

      if (this.applyVorticity) {
        this.vorticity.compute(renderer, this.velocity, this.velocityVorticity);
        this.vorticityConfinement.compute(
          renderer,
          this.velocity,
          this.velocityVorticity,
          this.velocity
        );
        this.boundary.compute(renderer, this.velocity, -1, this.velocity);
      }

      if (this.applyViscosity && this.viscosity > 0) {
        var s = this.grid.scale;

        this.diffuse.alpha = (s * s) / (this.viscosity * this.time.step);
        this.diffuse.beta = 4 + this.diffuse.alpha;
        this.diffuse.compute(
          renderer,
          this.velocity,
          this.velocity,
          this.velocity,
          this.boundary,
          -1
        );
      }

      this.project(renderer);
    },

    addForces: (function() {
      var point = new THREE.Vector2();
      var force = new THREE.Vector3();
      return function(renderer, mouse) {
        for (var i = 0; i < mouse.motions.length; i++) {
          var motion = mouse.motions[i];

          point.set(motion.position.x, this.windowSize.y - motion.position.y);
          // normalize to [0, 1] and scale to grid size
          point.x = (point.x / this.windowSize.x) * this.grid.size.x;
          point.y = (point.y / this.windowSize.y) * this.grid.size.y;

          if (motion.left) {
            force.set(motion.drag.x, -motion.drag.y, 0);
            this.splat.compute(
              renderer,
              this.velocity,
              force,
              point,
              this.velocity
            );
            this.boundary.compute(renderer, this.velocity, -1, this.velocity);
          }

          if (motion.right) {
            this.splat.compute(
              renderer,
              this.density,
              this.source,
              point,
              this.density
            );
          }
        }
        mouse.motions = [];
      };
    })(),

    // solve poisson equation and subtract pressure gradient
    project: function(renderer) {
      this.divergence.compute(renderer, this.velocity, this.velocityDivergence);

      // 0 is our initial guess for the poisson equation solver
      this.clearSlab(renderer, this.pressure);

      this.poissonPressureEq.alpha = -this.grid.scale * this.grid.scale;
      this.poissonPressureEq.compute(
        renderer,
        this.pressure,
        this.velocityDivergence,
        this.pressure,
        this.boundary,
        1
      );

      this.gradient.compute(
        renderer,
        this.pressure,
        this.velocity,
        this.velocity
      );
      this.boundary.compute(renderer, this.velocity, -1, this.velocity);
    },

    clearSlab: function(renderer, slab) {
      // renderer.clearTarget(slab.write, true, false, false);
      renderer.clear();
      slab.swap();
    }
  };

  F2D.Solver.make = function(grid, time, windowSize, shaders) {
    var w = grid.size.x,
      h = grid.size.y;

    var slabs = {
      // vec2
      velocity: F2D.Slab.make(w, h),
      // scalar
      density: F2D.Slab.make(w, h),
      velocityDivergence: F2D.Slab.make(w, h),
      velocityVorticity: F2D.Slab.make(w, h),
      pressure: F2D.Slab.make(w, h)
    };
    var slabop = {
      advect: new F2D.Advect(shaders.advect, grid, time),
      diffuse: new F2D.Jacobi(shaders.jacobivector, grid),
      divergence: new F2D.Divergence(shaders.divergence, grid),
      poissonPressureEq: new F2D.Jacobi(shaders.jacobiscalar, grid),
      gradient: new F2D.Gradient(shaders.gradient, grid),
      splat: new F2D.Splat(shaders.splat, grid),
      vorticity: new F2D.Vorticity(shaders.vorticity, grid),
      vorticityConfinement: new F2D.VorticityConfinement(
        shaders.vorticityforce,
        grid,
        time
      ),
      boundary: new F2D.Boundary(shaders.boundary, grid)
    };

    return new F2D.Solver(grid, time, windowSize, slabs, slabop);
  };

  F2D.main = function(renderer2, scene, camera) {
    ("use strict");
    var windowSize = new THREE.Vector2(window.innerWidth, window.innerHeight);

    var renderer = new THREE.WebGLRenderer();
    renderer.autoClear = false;
    renderer.sortObjects = false;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(windowSize.x, windowSize.y);
    renderer.setClearColor(0x00ff00);
    document.body.appendChild(renderer.domElement);

    var grid = {
      size: new THREE.Vector2(512, 256),
      scale: 1,
      applyBoundaries: true
    };
    var time = {
      step: 1
    };
    var displayScalar, displayVector;
    var displaySettings = {
      slab: "density"
    };
    var solver, gui;
    var mouse = new F2D.Mouse(grid);

    let shaders = {
      advect: advect,
      divergence: divergence,
      displayvector: displayvector,
      displayscalar: displayscalar,
      splat: splat,
      vorticity: vorticity,
      vorticityforce: vorticityforce,
      boundary: boundary,
      basic: basic,
      gradient: gradient,
      jacobiscalar: jacobiscalar,
      jacobivector: jacobivector
    };

    function init(shaders, scene, camera) {
      solver = F2D.Solver.make(grid, time, windowSize, shaders);
      displayScalar = new F2D.Display(
        camera,
        scene,
        shaders.basic,
        shaders.displayscalar
      );
      displayVector = new F2D.Display(
        camera,
        scene,
        shaders.basic,
        shaders.displayvector
      );

      gui = new dat.GUI();
      gui.add(displaySettings, "slab", [
        "density",
        "velocity",
        "divergence",
        "pressure"
      ]);
      gui
        .add(time, "step")
        .min(0)
        .step(0.01);

      var advectFolder = gui.addFolder("Advect");
      advectFolder.add(solver.advect, "dissipation", {
        none: 1,
        slow: 0.998,
        fast: 0.992,
        "very fast": 0.9
      });

      var viscosityFolder = gui.addFolder("Viscosity");
      viscosityFolder.add(solver, "applyViscosity");
      viscosityFolder
        .add(solver, "viscosity")
        .min(0)
        .step(0.01);

      var vorticityFolder = gui.addFolder("Vorticity");
      vorticityFolder.add(solver, "applyVorticity");
      vorticityFolder
        .add(solver.vorticityConfinement, "curl")
        .min(0)
        .step(0.01);

      var poissonPressureEqFolder = gui.addFolder("Poisson Pressure Equation");
      poissonPressureEqFolder.add(
        solver.poissonPressureEq,
        "iterations",
        0,
        500,
        1
      );

      // we need a splat color "adapter" since we want values between 0 and
      // 1 but also since dat.GUI requires a JavaScript array over a Three.js
      // vector
      var splatSettings = {
        color: [solver.ink.x * 255, solver.ink.y * 255, solver.ink.z * 255]
      };
      var splatFolder = gui.addFolder("Splat");
      splatFolder.add(solver.splat, "radius").min(0);
      splatFolder.addColor(splatSettings, "color").onChange(function(value) {
        solver.ink.set(value[0] / 255, value[1] / 255, value[2] / 255);
      });

      var gridFolder = gui.addFolder("Grid");
      gridFolder.add(grid, "applyBoundaries");
      gridFolder.add(grid, "scale");

      requestAnimationFrame(update);
    }

    function update() {
      solver.step(renderer, mouse);
      render();

      requestAnimationFrame(update);
    }

    function render() {
      var display, read;
      switch (displaySettings.slab) {
        case "velocity":
          display = displayVector;
          display.scaleNegative();
          read = solver.velocity.read;
          break;
        case "density":
          display = displayScalar;
          display.scale.copy(solver.ink);
          display.bias.set(0, 0, 0);
          read = solver.density.read;
          break;
        case "divergence":
          display = displayScalar;
          display.scaleNegative();
          read = solver.velocityDivergence.read;
          break;
        case "pressure":
          display = displayScalar;
          display.scaleNegative();
          read = solver.pressure.read;
          break;
      }
      display.render(renderer, read);
    }

    function resize() {
      windowSize.set(window.innerWidth, window.innerHeight);
      renderer.setSize(windowSize.x, windowSize.y);
    }
    window.onresize = resize;

    // var loader = new F2D.FileLoader("shaders", [
    //   "advect.fs",
    //   "basic.vs",
    //   "gradient.fs",
    //   "jacobiscalar.fs",
    //   "jacobivector.fs",
    //   "displayscalar.fs",
    //   "displayvector.fs",
    //   "divergence.fs",
    //   "splat.fs",
    //   "vorticity.fs",
    //   "vorticityforce.fs",
    //   "boundary.fs"
    // ]);
    // loader.run(function(files) {
    //   // remove file extension before passing shaders to init
    //   var shaders = {};
    //   for (var name in files) {
    //     shaders[name.split(".")[0]] = files[name];
    //   }

    // });
    init(shaders, scene, camera);
  };
})(F2D);

export default F2D;
