/**
* @fileOverview This file defines the Plane class.
* @author Jonathan Bronson</a>
* @exports Plane
*/
var Vector3 = require('./vector3');

module.exports = (function(){

'use strict';

var Plane = function(a, b, c, d) {
  this.a = a;
  this.b = b;
  this.c = c;
  this.d = d;
};

Plane.fromPoints = function(p1, p2, p3) {
    var n = p2.minus(p1).cross(p3.minus(p1)).normalize();
    var d = -n.dot(p1);
    return new Plane(n.x, n.y, n.z, d);
};

Plane.fromPointAndNormal = function(p, normal) {
  var d = -normal.dot(p);
  var plane = new Plane(normal.x, normal.y, normal.z, d);
  return plane;
};

Plane.prototype.getNormal = function() {
  return new Vector3(this.a, this.b, this.c);
};

return Plane;

}());
