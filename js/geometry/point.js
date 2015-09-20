var Vector = require('geometry/vector');

module.exports = (function(){

'use strict';

var Point = function(x, y) {  
  Vertex.call(this, x, y);  
}

Point.prototype = Object.create(Vector.prototype);
Point.prototype.constructor = Point;

}());
