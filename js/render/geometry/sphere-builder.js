import {GeometryBuilderBase} from './primitive-stream.js';

export class SphereBuilder extends GeometryBuilderBase {
  pushSphere(center, radius, subdivisions) {
    let stream = this.primitiveStream;
    
    const PI = Math.PI;
    const TWO_PI = PI * 2;
    let indexData = [];

    stream.startGeometry();  

    // Generate vertices and normals
    for (let latNumber = 0; latNumber <= subdivisions; latNumber++) {
      const theta = latNumber * PI / subdivisions;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let longNumber = 0; longNumber <= subdivisions; longNumber++) {
        const phi = longNumber * TWO_PI / subdivisions;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = cosPhi * sinTheta;
        const y = cosTheta;
        const z = sinPhi * sinTheta;
        const u = 1 - (longNumber / subdivisions);
        const v = 1 - (latNumber / subdivisions);

        const nx = x;
        const ny = y;
        const nz = z;
        const px = radius * x + center[0];
        const py = radius * y + center[1];
        const pz = radius * z + center[2];

        // Capture the next vertex index before adding the vertex
        let idx = stream.nextVertexIndex;
        indexData.push(idx); // Store index for later use in triangle creation

        // Add the vertex with position, uv, and normal data
        stream.pushVertex(px, py, pz, u, v, nx, ny, nz);
      }
    }

    // Generate faces using stored indices
    for (let latNumber = 0; latNumber < subdivisions; latNumber++) {
      for (let longNumber = 0; longNumber < subdivisions; longNumber++) {
        const first = (latNumber * (subdivisions + 1)) + longNumber;
        const second = first + subdivisions + 1;

        // Use the indices to specify vertices for each triangle
        stream.pushTriangle(indexData[first], indexData[second], indexData[first + 1]);
        stream.pushTriangle(indexData[second], indexData[second + 1], indexData[first + 1]);
      }
    }

    // End geometry definition
    stream.endGeometry();
  }

  // Convenience method for creating a unit sphere
  pushUnitSphere(center = [0, 0, 0], radius = 1.0, subdivisions = 32) {
    this.pushSphere(center, radius, subdivisions);
  }
}