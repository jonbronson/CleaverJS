var Vector = require('geometry/vector');

module.exports = (function(){ 

'use strict';

var ORDER = {
  '1': 'linear',
  '2': 'quadratic',
  '3': 'cubic'
};

var PathField = function(points, order, closed, strokeWidth, bounds) { 
  this.points = points;
  this.order = order;
  this.closed = closed;
  this.strokeWidth = strokeWidth;
  this.bounds = bounds;
};

/**
 * @overide
 */
PathField.prototype.valueAt = function(x, y) {
  var p = new Vector(x,y);      
  var d = distanceToLineSegment(this.points[0], this.points[1], p);
  var min_d = d;
  var end = this.closed ? this.points.length : this.points.length - 1;
  for (var i=1; i < end; i++) {
    d = distanceToLineSegment(this.points[i], this.points[(i+1)%this.points.length], p);
    if (d < min_d) {
      min_d = d;
    }
  }
  min_d = min_d - this.strokeWidth;
  return min_d;
};

/**
 * @overide
 */
PathField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
PathField.prototype.getWidth = function() {
  return this.bounds.size.x;
};

/**
 * @overide
 */
PathField.prototype.getHeight = function() {
  return this.bounds.size.y;
};

var clamp = function(x, min, max) {
  return (x < min) ? min : (x > max) ? max : x;
};

var distanceToLineSegment = function(p0, p1, x) {
  var a = x.minus(p0);
  var b = p1.minus(p0);
  var b_norm = new Vector(b.x, b.y).normalize();
  var t = a.dot(b_norm);
  t = clamp(t, 0, b.length());
  var tx = p0.plus(b.multiply(t/b.length()));            // p0.plus(p1.minus(p0).multiply(t));
  var d = x.minus(tx).length();
  return d;
};

return PathField;

}());
