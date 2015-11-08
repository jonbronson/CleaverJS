/**
 * @fileOverview This file defines the constance value field class
 * @author Jonathan Bronson</a>
 * @exports ConstantField
 */

module.exports = (function(){

'use strict';

/**
 * Creates a new ConstantField object
 * @class
 * @param {number} value The constant value throughout the field.
 * @param {Rect} bounds The bounding box of the field.
 * @constructor
 * @alias ConstantField
 * @extends Field
 */
var ConstantField = function(value, bounds) {
  this.value = value;
  this.bounds = bounds;
};

/**
 * @overide
 */
ConstantField.prototype.valueAt = function(x, y) {
  return this.value;
};

/**
 * @overide
 */
ConstantField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
ConstantField.prototype.getWidth = function() {
  return this.bounds.size.x;
};

/**
 * @overide
 */
ConstantField.prototype.getHeight = function() {
  return this.bounds.size.y;
};

return ConstantField;

}());
