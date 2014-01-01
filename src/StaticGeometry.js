/**
 * StaticGeometry can not be changed once they've been setup
 */
define(function(require) {

    'use strict';

    var Geometry = require("./Geometry");
    var util = require("./core/util");
    var BoundingBox = require("./math/BoundingBox");
    var glMatrix = require("glmatrix");
    var glenum = require("./core/glenum");
    var mat4 = glMatrix.mat4;
    var vec3 = glMatrix.vec3;

    var StaticGeometry = Geometry.derive(function() {
        return {
            attributes : {
                 position : {
                    type : 'float',
                    semantic : "POSITION",
                    size : 3,
                    value : null
                 },
                 texcoord0 : {
                    type : 'float',
                    semantic : "TEXCOORD_0",
                    size : 2,
                    value : null
                 },
                 texcoord1 : {
                    type : 'float',
                    semantic : "TEXCOORD_1",
                    size : 2,
                    value : null
                 },
                 normal : {
                    type : 'float',
                    semantic : "NORMAL",
                    size : 3,
                    value : null
                 },
                 tangent : {
                    type : 'float',
                    semantic : "TANGENT",
                    size : 4,
                    value : null
                 },
                 color : {
                    type : 'float',
                    semantic : "COLOR",
                    size : 4,
                    value : null
                 },
                 // Skinning attributes
                 // Each vertex can be bind to 4 bones, because the 
                 // sum of weights is 1, so the weights is stored in vec3 and the last
                 // can be calculated by 1-w.x-w.y-w.z
                 weight : {
                    type : 'float',
                    semantic : 'WEIGHT',
                    size : 3,
                    value : null
                 },
                 joint : {
                    type : 'float',
                    semantic : 'JOINT',
                    size : 4,
                    value : null
                 },
                 // For wireframe display
                 // http://codeflow.org/entries/2012/aug/02/easy-wireframe-display-with-barycentric-coordinates/
                 barycentric : {
                    type : 'float',
                    size : 3,
                    value : null
                 }
            },

            hint : glenum.STATIC_DRAW,

            _normalType : 'vertex',

            _enabledAttributes : null,

        }
    }, {
        dirty : function() {
            this.cache.dirtyAll("chunks");
            this._enabledAttributes = null;
        },
        
        getVertexNumber : function() {
            return this.attributes.position.value.length / 3;
        },

        getFaceNumber : function() {
            return this.faces.length / 3;
        },
        
        isUseFace : function() {
            return this.useFace && this.faces.length;
        },

        getEnabledAttributes : function() {
            // Cache
            if (this._enabledAttributes) {
                return this._enabledAttributes;
            }

            var result = {};
            var vertexNumber = this.getVertexNumber();

            for (var name in this.attributes) {
                var attrib = this.attributes[name];
                if (attrib.value) {
                    if (attrib.value.length === vertexNumber * attrib.size) {
                        result[name] = attrib;
                    }
                }
            }

            this._enabledAttributes = result;

            return result;
        },

        getBufferChunks : function(_gl) {
            this.cache.use(_gl.__GLID__);
            if (this.cache.isDirty("chunks")) {
                this._updateBuffer(_gl);
                this.cache.fresh("chunks");
            }
            return this.cache.get("chunks");
        },
        
        _updateBuffer : function(_gl) {
            var chunks = this.cache.get("chunks");
            if (! chunks) {
                chunks = [];
                // Intialize
                chunks[0] = {
                    attributeBuffers : [],
                    indicesBuffer : null
                }
                this.cache.put("chunks", chunks);
            }
            var chunk = chunks[0];
            var attributeBuffers = chunk.attributeBuffers;
            var indicesBuffer = chunk.indicesBuffer;

            var attributes = this.getEnabledAttributes();
            for (var name in attributes) {
                var attribute = attributes[name];
                if (!attribute.value) {
                    continue;
                }

                var bufferInfo;
                for (var i = idx; i < attributeBuffers.length; i++) {
                    if (attributeBuffers[i].name === name) {
                        bufferInfo = attributeBuffers[i];
                        idx = i + 1;
                        break;
                    }
                }
                for (var i = idx - 1; i >= 0; i--) {
                    if (attributeBuffers[i].name === name) {
                        bufferInfo = attributeBuffers[i];
                        idx = i;
                        break;
                    }
                }
                
                var buffer;
                if (bufferInfo) {
                    buffer = bufferInfo.buffer;
                } else {
                    buffer = _gl.createBuffer();
                }
                //TODO: Use BufferSubData?
                _gl.bindBuffer(_gl.ARRAY_BUFFER, buffer);
                _gl.bufferData(_gl.ARRAY_BUFFER, attribute.value, this.hint);

                attributeBuffers.push(new Geometry.AttributeBuffer(name, attribute.type, buffer, attribute.size, attribute.semantic));
            }
            if (! indicesBuffer && this.isUseFace()) {
                indicesBuffer = new Geometry.IndicesBuffer(_gl.createBuffer(), this.faces.length);
                chunk.indicesBuffer = indicesBuffer;
            }
            _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, indicesBuffer.buffer);
            _gl.bufferData(_gl.ELEMENT_ARRAY_BUFFER, this.faces, this.hint);
        },

        generateVertexNormals : function() {
            console.warn('Static Geometry doesn\'t support normal generate');
        },

        generateFaceNormals : function() {
            console.warn('Static Geometry doesn\'t support normal generate');
        },

        generateTangents : function() {
            var vertexNumber = this.getVertexNumber();
            if (!this.attributes.tangent.value) {
                this.attributes.tangent.value = new Float32Array(vertexNumber * 4);
            }
            var texcoords = this.attributes.texcoord0.value;
            var positions = this.attributes.position.value;
            var tangents = this.attributes.tangent.value;
            var normals = this.attributes.normal.value;

            var tan1 = [];
            var tan2 = [];
            for (var i = 0; i < vertexNumber; i++) {
                tan1[i] = [0.0, 0.0, 0.0];
                tan2[i] = [0.0, 0.0, 0.0];
            }

            var sdir = [0.0, 0.0, 0.0];
            var tdir = [0.0, 0.0, 0.0];
            for (var i = 0; i < this.faces.length;) {
                var i1 = this.faces[i++],
                    i2 = this.faces[i++],
                    i3 = this.faces[i++],

                    st1s = texcoords[i1 * 2],
                    st2s = texcoords[i2 * 2],
                    st3s = texcoords[i3 * 2],
                    st1t = texcoords[i1 * 2 + 1],
                    st2t = texcoords[i2 * 2 + 1],
                    st3t = texcoords[i3 * 2 + 1],

                    p1x = positions[i1 * 3],
                    p2x = positions[i2 * 3],
                    p3x = positions[i3 * 3];
                    p1y = positions[i1 * 3 + 1],
                    p2y = positions[i2 * 3 + 1],
                    p3y = positions[i3 * 3 + 1];
                    p1z = positions[i1 * 3 + 2],
                    p2z = positions[i2 * 3 + 2],
                    p3z = positions[i3 * 3 + 2];

                var x1 = p2x - p1x,
                    x2 = p3x - p1x,
                    y1 = p2y - p1y,
                    y2 = p3y - p1y,
                    z1 = p2z - p1z,
                    z2 = p3z - p1z;

                var s1 = st2s - st1s,
                    s2 = st3s - st1s,
                    t1 = st2t - st1t,
                    t2 = st3t - st1t;

                var r = 1.0 / (s1 * t2 - t1 * s2);
                sdir[0] = (t2 * x1 - t1 * x2) * r;
                sdir[1] = (t2 * y1 - t1 * y2) * r; 
                sdir[2] = (t2 * z1 - t1 * z2) * r;

                tdir[0] = (s1 * x2 - s2 * x1) * r;
                tdir[1] = (s1 * y2 - s2 * y1) * r;
                tdir[2] = (s1 * z2 - s2 * z1) * r;

                vec3.add(tan1[i1], tan1[i1], sdir);
                vec3.add(tan1[i2], tan1[i2], sdir);
                vec3.add(tan1[i3], tan1[i3], sdir);
                vec3.add(tan2[i1], tan2[i1], tdir);
                vec3.add(tan2[i2], tan2[i2], tdir);
                vec3.add(tan2[i3], tan2[i3], tdir);
            }
            var tmp = vec3.create();
            var nCrossT = vec3.create();
            var n = vec3.create();
            for (var i = 0; i < vertexNumber; i++) {
                n[0] = normals[i * 3];
                n[1] = normals[i * 3 + 1];
                n[2] = normals[i * 3 + 2];
                var t = tan1[i];

                // Gram-Schmidt orthogonalize
                vec3.scale(tmp, n, vec3.dot(n, t));
                vec3.sub(tmp, t, tmp);
                vec3.normalize(tmp, tmp);
                // Calculate handedness.
                vec3.cross(nCrossT, n, t);
                tangents[i * 4] = tmp[0];
                tangents[i * 4 + 1] = tmp[1];
                tangents[i * 4 + 2] = tmp[2];
                tangents[i * 4 + 3] = vec3.dot(nCrossT, tan2[i]) < 0.0 ? -1.0 : 1.0;;
            }
        },

        isUniqueVertex : function() {
            if (this.isUseFace()) {
                return this.getVertexNumber() === this.faces.length;
            } else {
                return true;
            }
        },

        generateUniqueVertex : function() {
            var vertexUseCount = [];

            for (var i = 0, len = this.getVertexNumber(); i < len; i++) {
                vertexUseCount[i] = 0;
            }

            var cursor = this.getVertexNumber();
            var attributes = this.getEnabledAttributes();
            var faces = this.faces;

            var attributeNameList = Object.keys(attributes);

            for (var name in attributes) {
                var expandedArray = new Float32Array(this.faces.length * attributes[name].size);
                var len = attributes[name].value.length;
                for (var i = 0; i < len; i++) {
                    expandedArray[i] = attributes[name].value[i];
                }
                attributes[name].value = expandedArray;
            }

            for (var i = 0; i < faces.length; i++) {
                var ii = faces[i];
                if (vertexUseCount[ii] > 0) {
                    for (var a = 0; a < attributeNameList.length; a++) {
                        var name = attributeNameList[a];
                        var array = attributes[name].value;
                        var size = attributes[name].size;

                        for (var k = 0; k < size; k++) {
                            array[cursor * size + k] = array[ii * size + k];
                        }
                    }
                    faces[i] = cursor;
                    cursor++;
                }
                vertexUseCount[ii]++;
            }
        },

        generateBarycentric : function() {

            if (! this.isUniqueVertex()) {
                this.generateUniqueVertex();
            }

            var array = this.attributes.barycentric.value;
            // Already existed;
            if (array && array.length === this.faces.length * 3) {
                return;
            }
            array = this.attributes.barycentric.value = new Float32Array(this.faces.length * 3);
            var i1, i2, i3, face;
            for (var i = 0; i < this.faces.length;) {
                for (var j = 0; j < 3; j++) {
                    var ii = this.faces[i++];
                    array[ii + j] = 1;
                }
            }
        },

        convertToDynamic : function(geometry) {
            var offset = 0;
            var chunk = this._arrayChunks[c];

            for (var i = 0; i < this.faces.length; i+=3) {
                geometry.faces.push(this.face.subarray(i, i + 3));
            }

            var attributes = this.getEnabledAttributes();
            for (var name in attributes) {
                var attrib = attributes[name];
                var geoAttrib = geometry.attributes[name];
                if (!geoAttrib) {
                    geoAttrib = geometry.attributes[name] = {
                        type : attrib.type,
                        size : attrib.size,
                        value : []
                    }
                    if (attrib.semantic) {
                        geoAttrib.semantic = attrib.semantic;
                    }
                }
                for (var i = 0; i < attrib.value.length; i+= attrib.size) {
                    if (attrib.size === 1) {
                        geoAttrib.value.push(attrib.array[i]);
                    } else {
                        geoAttrib.value.push(attrib.subarray(i, i + attrib.size));
                    }
                }
            }

            if (this.boundingBox) {
                geometry.boundingBox = new BoundingBox();
                geometry.boundingBox.min.copy(this.boundingBox.min);
                geometry.boundingBox.max.copy(this.boundingBox.max);
            }
            // PENDING : copy buffer ?
            
            return geometry;
        },

        applyTransform : function(matrix) {

            if (this.boundingBox) {
                this.boundingBox.applyTransform(matrix);
            }

            var positions = this.attributes.position.value;
            var normals = this.attributes.normal.value;
            var tangents = this.attributes.tangent.value;

            matrix = matrix._array;
            // Normal Matrix
            var inverseTransposeMatrix = mat4.create();
            mat4.invert(inverseTransposeMatrix, matrix);
            mat4.transpose(inverseTransposeMatrix, inverseTransposeMatrix);

            vec3.forEach(positions, 3, 0, null, vec3.transformMat4, matrix);
            if (normals) {
                vec3.forEach(normals, 3, 0, null, vec3.transformMat4, inverseTransposeMatrix);
            }
            if (tangents) {
                vec3.forEach(tangents, 4, 0, null, vec3.transformMat4, inverseTransposeMatrix);   
            }
        },

        dispose : function(_gl) {
            this.cache.use(_gl.__GLID__);
            var chunks = this.cache.get('chunks');
            if (chunks) {
                for (var c = 0; c < chunks.length; c++) {
                    var chunk = chunks[c];

                    for (var name in chunk.attributeBuffers) {
                        var attribs = chunk.attributeBuffers[name];
                        _gl.deleteBuffer(attribs.buffer);
                    }
                }
            }
            this.cache.deleteContext(_gl.__GLID__);
        }
    });

    return StaticGeometry;
})