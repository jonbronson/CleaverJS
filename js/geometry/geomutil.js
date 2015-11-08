var Point = require('./point');
var Vector = require('./vector');
var Vector3 = require('./vector3');

module.exports = (function(){

'use strict';

var GeomUtil = {

  /**
   * Computes the intersection point of two lines, each defined by two points.
   * @param {Point} p1 First point of Line 1
   * @param {Point} p2 Second Point of Line 1
   * @param {Point} p3 First Point of Line 2
   * @param {Point} p4 Second Point of Line 2
   * @returns {Object} The intersection parameters.
   */
  computeLineIntersection: function(p1, p2, p3, p4) {
    var ua_top = (p4.x - p3.x)*(p1.y - p3.y) - (p4.y - p3.y)*(p1.x - p3.x);
    var ua_bot = (p4.y - p3.y)*(p2.x - p1.x) - (p4.x - p3.x)*(p2.y - p1.y);

    var ub_top = (p2.x - p1.x)*(p1.y - p3.y) - (p2.y - p1.y)*(p1.x - p3.x);
    var ub_bot = (p4.y - p3.y)*(p2.x - p1.x) - (p4.x - p3.x)*(p2.y - p1.y);

    var u_a = ua_top / ua_bot;
    var u_b = ub_top / ub_bot;

    return { 'ua': u_a, 'ub': u_b};
  },

  /**
   * Computes the intersection point of three planes.
   * @param {Plane} plane1
   * @param {Plane} plane2
   * @param {Plane} plane3
   * @returns {Point}
   */
  computePlaneIntersection: function(plane1, plane2, plane3) {
    var n1 = plane1.getNormal();
    var n2 = plane2.getNormal();
    var n3 = plane3.getNormal();

    var term1 = n2.cross(n3).multiply(plane1.d);
    var term2 = n3.cross(n1).multiply(plane2.d);
    var term3 = n1.cross(n2).multiply(plane3.d);
    var term4 = 1.0 / Vector3.dot(n1, Vector3.cross(n2, n3));

    var result = term1.plus(term2).plus(term3).multiply(term4);
    if (isNaN(result.x) || isNaN(result.y) == NaN || isNaN(result.z) == NaN) {
      var error = new Error('failed to compute 3-plane intersection');
      console.log(error.stack());
    }
    return result;
  },

  /**
   * Returns an array of all interior angles in the mesh.
   * @param {Mesh}
   * @returns {Array}
   */
  computeMeshAngles: function(mesh) {
    var angles = [];
    for (var f=0; f < mesh.faces.length; f++) {
      var face = mesh.faces[f];
      var p = [face.v1.pos, face.v2.pos, face.v3.pos];
      for (var i=0; i < 3; i++) {
        var vec1 = p[(i+1)%3].minus(p[i]).normalize();
        var vec2 = p[(i+2)%3].minus(p[i]).normalize();
        var theta = Math.acos(Vector.dot(vec1, vec2));
        theta *= 180 / Math.PI;
        angles.push(theta);
      }
    }
    return angles;
  }
};

return GeomUtil;

}());