var Vector = require('./vector');

module.exports = (function(){

'use strict';

var Point = function(x, y) {  
  Vector.call(this, x, y);  
}

Point.prototype = Object.create(Vector.prototype);
Point.prototype.constructor = Point;

return Point;

}());
