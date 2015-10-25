/**
 * @fileOverview This file defines the scaled field class
 * @author Jonathan Bronson</a>
 * @exports ScaledField
 */
var Vector = require('../geometry/vector');

module.exports = (function(){

'use strict';

var ScaledField = function(field, scale, bounds) {
  this.field = field;
  this.scale = scale;
  this.bounds = bounds;
};


/**
 * @overide
 */
ScaledField.prototype.valueAt = function(x, y) {
  return this.scale * this.field.valueAt(x,y);
};

/**
 * @overide
 */
ScaledField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
ScaledField.prototype.getWidth = function() {
  return this.bounds.width();
};

/**
 * @overide
 */
ScaledField.prototype.getHeight = function() {
  return this.bounds.height();
};

return ScaledField;

}());
