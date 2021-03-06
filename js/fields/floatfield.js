/**
* @fileOverview This file defines the FloatField class.
* @author Jonathan Bronson</a>
*/

var Field = require('./field');
var Rect = require('../geometry/rect');

module.exports = (function(){

'use strict';

/**
 * Creates a new FloatField object
 * @class
 * @param {number} width The width of the data array
 * @param {number} height The height of the data array
 * @param {Array.<number>} data The float field array.
 * @constructor
 * @extends Field
 * @alias FloatField
 */
var FloatField = function(width, height, data) {
  this.data = data;
  this.bounds = new Rect(0, 0, width, height);
};
FloatField.prototype = Object.create(Field.prototype);

/**
 * Returns the nearest neighbor L1 value.
 * @param {number} x coordinate
 * @param {number} y coordinate
 * @returns {number}
 */
FloatField.prototype.nearestValueAt = function(x, y) {
  var x_index = Math.round(x);
  var y_index = Math.round(y);
  return this.data[y_index*this.bounds.size.x + x_index];
};

/**
 * Clamps the value between min and max.
 * @param {number} value The value to clamp.
 * @param {number} min The minimum value of the valid range.
 * @param {number} max The maximum value of the valid range.
 * @returns {number}
 */
var clamp = function(value, min, max) {
  return Math.min(Math.max(value, min), max);
};

/**
 * @override
 */
FloatField.prototype.valueAt = function(x, y) {
  x -= 0.5;
  y -= 0.5;
  var u = x % 1.0;
  var v = y % 1.0;

  var i0 = Math.floor(x);
  var i1 = i0 + 1;
  var j0 = Math.floor(y);
  var j1 = j0 + 1;

  i0 = clamp(i0, 0, this.bounds.width() - 1);
  i1 = clamp(i1, 0, this.bounds.width() - 1);
  j0 = clamp(j0, 0, this.bounds.height() - 1);
  j1 = clamp(j1, 0, this.bounds.height() - 1);

  var C00 = this.data[i0 + j0 * this.bounds.width()];
  var C01 = this.data[i0 + j1 * this.bounds.width()];
  var C10 = this.data[i1 + j0 * this.bounds.width()];  // height?
  var C11 = this.data[i1 + j1 * this.bounds.width()];  // height?

  return  (1-u)*(1-v)*C00 +  (1-u)*(  v)*C01 +
          (  u)*(1-v)*C10 +  (  u)*(  v)*C11;
};

/**
 * @override
 */
FloatField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @override
 */
FloatField.prototype.getWidth = function() {
  return this.bounds.width();
};

/**
 * @override
 */
FloatField.prototype.getHeight = function() {
  return this.bounds.height();
};

return FloatField;

}());
