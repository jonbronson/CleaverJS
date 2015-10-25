/**
 * @fileOverview This file defines the interface for scalar fields
 * @author Jonathan Bronson</a>
 * TODO: Rename ScalarField
 * @exports Field
 */
module.exports = (function(){

'use strict';

/**
 * Interface for classes that represent scalar fields
 * @interface
 * @alias Field
 */
var Field = function() {};

/**
 * Get the value of the field at coordinate (x,y)
 * @returns {number}
 */
Field.prototype.valueAt = function(x, y) {};

/**
 * Get the bounding box of the field
 * @returns {Rect}
 */
Field.prototype.getBounds = function() {};

/**
 * Get the width of the field
 * @returns {number}
 */
Field.prototype.getWidth = function() {};

/**
 * Get the height of the field
 * @returns {number}
 */
Field.prototype.getHeight = function() {};

return Field;

}());
