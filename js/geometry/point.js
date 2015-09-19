
var Vector = require('./vector');


module.exports = (function(){

var Point = function(x, y) {  
  Vertex.call(this, x, y);  
}

Point.prototype = Object.create(Vector.prototype);
Point.prototype.constructor = Point;


}());