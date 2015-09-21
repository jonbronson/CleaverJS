var QuadTree = require('quadtree');
var Triangle = require('geometry/triangle');
var Vertex = require('geometry/vertex');
var Vector = require('geometry/vector');
var Mesh = require('geometry/mesh');

module.exports = (function(){

'use strict'; 

// edges:    lexographical ordering
// vertices:  counter-clockwise as seen from center of cell
var EDGE_VERTICES = [
    [3, 0],     //  (-x face)
    [1, 2],     //  (+x face)
    [0, 1],     //  (-y face)
    [2, 3]];    //  (+y face)    


var QuadTreeMesher = function(tree) {
  this.tree = tree;
  this.vertexMap = {};
};


QuadTreeMesher.prototype.vertexForPosition_ = function(vector, opt_doNotCreate) {
  
  var vertex = this.vertexMap[vector.toString()];

  if (vertex === undefined && !opt_doNotCreate) {
    vertex = new Vertex(vector);
    this.vertexMap[vector.toString()] = vertex;
  }

  return vertex;
};

QuadTreeMesher.prototype.createVertices_ = function() {
  var queue = [];
  queue.push(tree.getRoot());

  while (queue.length > 0) {
    var cell = queue.shift();
    
    if (cell.hasChildren()) {
      for (var i=0; i < 4; i++) {
        queue.push(cell.children[i]);
      }
    } else {
      var bounds = cell.bounds;
      this.vertexForPosition_(new Vector(cell.bounds.left,                       cell.bounds.bottom                     ));
      this.vertexForPosition_(new Vector(cell.bounds.left + cell.bounds.width(), cell.bounds.bottom                     ));
      this.vertexForPosition_(new Vector(cell.bounds.left + cell.bounds.width(), cell.bounds.bottom + cell.bounds.height()));
      this.vertexForPosition_(new Vector(cell.bounds.left                     ,  cell.bounds.bottom + cell.bounds.height()));
      this.vertexForPosition_(new Vector(cell.bounds.left + 0.5*cell.bounds.width(), 
                                         cell.bounds.bottom + 0.5*cell.bounds.height()));
    }
  } 
};

QuadTreeMesher.prototype.createTriangles_ = function() {
  var queue = [];
  queue.push(tree.getRoot());

  while (queue.length > 0) {
    var cell = queue.shift();
    
    if (cell.hasChildren()) {
      for (var i=0; i < 4; i++) {
        queue.push(cell.children[i]);
      }
    } else {  
      var bounds = cell.bounds;
      var verts = [];
      verts.push(this.vertexForPosition_(new Vector(cell.bounds.left,                       cell.bounds.bottom                     )));
      verts.push(this.vertexForPosition_(new Vector(cell.bounds.left + cell.bounds.width(), cell.bounds.bottom                     )));
      verts.push(this.vertexForPosition_(new Vector(cell.bounds.left + cell.bounds.width(), cell.bounds.bottom + cell.bounds.height())));
      verts.push(this.vertexForPosition_(new Vector(cell.bounds.left                     ,  cell.bounds.bottom + cell.bounds.height())));
      var v_c = this.vertexForPosition_(new Vector(cell.bounds.left + 0.5*cell.bounds.width(), 
                                                   cell.bounds.bottom + 0.5*cell.bounds.height()));

      // Collect edge neighbors
      var neighbors = [];
      for (var e=0; e < 4; e++) {
        neighbors[e] = this.tree.getNeighborAtLevel(cell, e, cell.level);
      }

      // Create faces for each edge
      for (var e=0; e < 4; e++) {
        // no neighbor? must be on boundary
        /*
        if (neighbors[e] === null) {
          // output a single triangle
          this.mesh.createFace(verts[EDGE_VERTICES[e][0]], 
                               verts[EDGE_VERTICES[e][1]],  
                               v_c, 1);
          
        } else if(neighbors[e].level === cell.level && !neighbors[e].hasChildren()) {
          // same level
          // output a single triangle
          this.mesh.createFace(verts[EDGE_VERTICES[e][0]], 
                               verts[EDGE_VERTICES[e][1]],  
                               v_c, 2);
        } else {
          // neighbor is lower level (should only be one lower...)
          
          // grab vertex in middle of face on boundary
          var v_m = this.vertexForPosition_(new Vector(0.5*(verts[EDGE_VERTICES[e][0]].x + verts[EDGE_VERTICES[e][1]].x),
                                                       0.5*(verts[EDGE_VERTICES[e][0]].y + verts[EDGE_VERTICES[e][1]].y)));
          // create 2 triangles, split on middle of edge
          this.mesh.createFace(verts[EDGE_VERTICES[e][0]], v_m, v_c, 3);
          this.mesh.createFace(verts[EDGE_VERTICES[e][1]], v_m, v_c, 3);                 
        }
        */
        var v_m = this.vertexForPosition_(new Vector(0.5*(verts[EDGE_VERTICES[e][0]].pos.x + verts[EDGE_VERTICES[e][1]].pos.x),
                                                     0.5*(verts[EDGE_VERTICES[e][0]].pos.y + verts[EDGE_VERTICES[e][1]].pos.y)), true);
        if (v_m) {
          this.mesh.createFace(verts[EDGE_VERTICES[e][0]], v_m, v_c, 3);
          this.mesh.createFace(verts[EDGE_VERTICES[e][1]], v_m, v_c, 3);             
        } else {
          this.mesh.createFace(verts[EDGE_VERTICES[e][0]], 
                               verts[EDGE_VERTICES[e][1]],  
                               v_c, 1);
        }
      }

    }
  }
};

QuadTreeMesher.prototype.setQuadTree = function(tree) {
  this.tree = tree;
};

QuadTreeMesher.prototype.createMesh = function() {
  if (!this.tree) 
    throw new Error('no quad tree provided');

  this.mesh = new Mesh();
  
  var queue = [];
  queue.push(tree.getRoot());

  while(queue.length > 0) {
    var cell = queue.shift();
    
    // only create triangles for leaves of tree
    if (cell.hasChildren()) {
      for (var i=0; i < 4; i++) {
        queue.push(cell.children[i]);
      }
    } else {
      this.meshCell_(cell);     
    }
  }

  // add vertices to vertex list
  
  //this.createVertices_();
  //this.createTriangles_();

  return this.mesh;
};

QuadTreeMesher.prototype.meshCell_ = function(cell) {
  var bounds = cell.bounds;
  var verts = [];

  verts.push(this.vertexForPosition_(new Vector(cell.bounds.left,
                                                cell.bounds.bottom)));
  verts.push(this.vertexForPosition_(new Vector(cell.bounds.left + cell.bounds.width(), 
                                                cell.bounds.bottom)));
  verts.push(this.vertexForPosition_(new Vector(cell.bounds.left + cell.bounds.width(),
                                                cell.bounds.bottom + cell.bounds.height())));
  verts.push(this.vertexForPosition_(new Vector(cell.bounds.left,
                                                cell.bounds.bottom + cell.bounds.height())));
  var v_c = this.vertexForPosition_(new Vector(cell.bounds.left + 0.5*cell.bounds.width(), 
                                               cell.bounds.bottom + 0.5*cell.bounds.height()));

  // Create Triangles Touch Each Edge
  var neighbors = [];
  for (var e=0; e < 4; e++) {
    neighbors[e] = this.tree.getNeighborAtLevel(cell, e, cell.level, true);

    if (neighbors[e] == null) {
      this.mesh.createFace(verts[EDGE_VERTICES[e][0]], 
                           verts[EDGE_VERTICES[e][1]],  
                           v_c, 1);
    }  // TODO (neighbors[e].level === cell.level Check below SHOULD WORK. But it doesn't)
    else if (neighbors[e].level === cell.level && !neighbors[e].hasChildren()) {
      this.mesh.createFace(verts[EDGE_VERTICES[e][0]], 
                           verts[EDGE_VERTICES[e][1]],  
                           v_c, 2);
    }
    else if (neighbors[e].level === cell.level + 1) {
      this.mesh.createFace(verts[EDGE_VERTICES[e][0]], 
                           verts[EDGE_VERTICES[e][1]],  
                           v_c, 2);
    } else if (neighbors[e].level === cell.level && neighbors[e].hasChildren()) {     
      var v_m = this.vertexForPosition_(new Vector(0.5*(verts[EDGE_VERTICES[e][0]].pos.x + verts[EDGE_VERTICES[e][1]].pos.x),
                                                   0.5*(verts[EDGE_VERTICES[e][0]].pos.y + verts[EDGE_VERTICES[e][1]].pos.y)));
      this.mesh.createFace(verts[EDGE_VERTICES[e][0]], v_m, v_c, 3);
      this.mesh.createFace(verts[EDGE_VERTICES[e][1]], v_c, v_m, 3);             
    } /*else {
      throw new Error('Error, quadtree is not balanced.');
    }  */
  }
}


return QuadTreeMesher;

}());
