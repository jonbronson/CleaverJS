/**
 * @fileOverview This file defines the inverse field class
 * @author Jonathan Bronson</a>
 * @exports InverseField
 */

module.exports = (function(){

'use strict';

/**
 * Creates a new InverseField object
 * @class
 * @param {Field} field The field which this field is the inverse of.
 * @constructor
 * @alias InverseField
 * @extends Field
 */
var InverseField = function(field) {
  this.field = field;
  this.bounds = field.bounds;
};

/**
 * @overide
 */
InverseField.prototype.valueAt = function(x, y) {
  return -1*this.field.valueAt(x,y);
};

/**
 * @overide
 */
InverseField.prototype.getBounds = function() {
  return this.bounds;
};

/**
 * @overide
 */
InverseField.prototype.getWidth = function() {
  return this.bounds.size.x;
};

/**
 * @overide
 */
InverseField.prototype.getHeight = function() {
  return this.bounds.size.y;
};

return InverseField;

}());
