var Vertex = require('geometry/vertex');

module.exports = (function(){ 

var HalfEdge = function(vertex) {
	this.vertex = vertex;
	this.mate = null;
	this.cut = null;
	this.next = null;
};

return HalfEdge;

}());
