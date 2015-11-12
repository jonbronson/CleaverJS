/**
 * @fileOverview This file defines the scaled field class
 * @author Jonathan Bronson</a>
 */
var Vector = require('../geometry/vector');

module.exports = (function(){

'use strict';

/**
 * Creates a new ScaledField object
 * @class
 * @param {Field} field
 * @param {number} scale
 * @param {Rect} bounds
 * @constructor
 * @alias ScaledField
 * @extends Field
 */
var ScaledField = function(field, scale, bounds) {
  this.field = field;
  this.scale = scale;
  this.bounds = bounds;
};

/**
 * Get the value of the field at coordinate (x,y)
 * @override
 * @returns {number}
 */
ScaledField.prototype.valueAt = function(x, y) {
  return this.scale * this.field.valueAt(x,y);
};

/**
 * Get the bounding box of the field
 * @override
 * @returns {Rect}
 */
ScaledField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * Get the width of the field
 * @override
 * @returns {number}
 */
ScaledField.prototype.getWidth = function() {
  return this.bounds.width();
};

/**
 * Get the height of the field
 * @override
 * @returns {number}
 */
ScaledField.prototype.getHeight = function() {
  return this.bounds.height();
};

return ScaledField;

}());
