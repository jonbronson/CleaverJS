/**
 * @fileOverview This file defines the Transformed field class
 * @author Jonathan Bronson</a>
 */
var Vector = require('../geometry/vector');

module.exports = (function(){

'use strict';

/**
 * Creates a new TransformedField object
 * @class
 * @param {Field} field
 * @param {Matrix} transform
 * @param {Rect} bounds
 * @constructor
 * @alias TransformedField
 * @extends Field
 */
var TransformedField = function(field, transform, bounds) {
  this.field = field;
  this.transform = transform;
  this.inverseTransform = transform.inverse();
  this.bounds = bounds;
};

/**
 * Get the value of the field at coordinate (x,y)
 * @override
 * @returns {number}
 */
TransformedField.prototype.valueAt = function(x, y) {
  var transformedTo = this.inverseTransform.multiplyVector(new Vector(x,y));
  return this.field.valueAt(transformedTo.x, transformedTo.y);
};

/**
 * Get the bounding box of the field
 * @override
 * @returns {Rect}
 */
TransformedField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * Get the width of the field
 * @override
 * @returns {number}
 */
TransformedField.prototype.getWidth = function() {
  return this.bounds.size.x;
};

/**
 * Get the height of the field
 * @override
 * @returns {number}
 */
TransformedField.prototype.getHeight = function() {
  return this.bounds.size.y;
};

return TransformedField;

}());
