export default function(params) {
  return `
  #version 100
  precision highp float;
  
  uniform sampler2D u_gbuffers[${params.numGBuffers}];
  uniform sampler2D u_lightbuffer;
  uniform sampler2D u_clusterbuffer;

  uniform mat4 u_viewMatrix;
  uniform int u_screenWidth;
  uniform int u_screenHeight;
  uniform float u_near;
  uniform float u_far;

  varying vec2 v_uv;
  
  struct Light {
    vec3 position;
    float radius;
    vec3 color;
  };

  float ExtractFloat(sampler2D texture, int textureWidth, int textureHeight, int index, int component) {
    float u = float(index + 1) / float(textureWidth + 1);
    int pixel = component / 4;
    float v = float(pixel + 1) / float(textureHeight + 1);
    vec4 texel = texture2D(texture, vec2(u, v));
    int pixelComponent = component - pixel * 4;
    if (pixelComponent == 0) {
      return texel[0];
    } else if (pixelComponent == 1) {
      return texel[1];
    } else if (pixelComponent == 2) {
      return texel[2];
    } else if (pixelComponent == 3) {
      return texel[3];
    }
  }

  Light UnpackLight(int index) {
    Light light;
    float u = float(index + 1) / float(${params.numLights + 1});
    vec4 v1 = texture2D(u_lightbuffer, vec2(u, 0.3));
    vec4 v2 = texture2D(u_lightbuffer, vec2(u, 0.6));
    light.position = v1.xyz;

    // LOOK: This extracts the 4th float (radius) of the (index)th light in the buffer
    // Note that this is just an example implementation to extract one float.
    // There are more efficient ways if you need adjacent values
    light.radius = ExtractFloat(u_lightbuffer, ${params.numLights}, 2, index, 3);

    light.color = v2.rgb;
    return light;
  }

  // Cubic approximation of gaussian curve so we falloff to exactly 0 at the light radius
  float cubicGaussian(float h) {
    if (h < 1.0) {
      return 0.25 * pow(2.0 - h, 3.0) - pow(1.0 - h, 3.0);
    } else if (h < 2.0) {
      return 0.25 * pow(2.0 - h, 3.0);
    } else {
      return 0.0;
    }
  }

  vec3 decodeNormal(vec2 f) {
    f = f * 2.0 - 1.0;
    vec3 n = vec3(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
    float t = clamp(-n.z, 0.0, 1.0);
    n.x += n.x >= 0.0 ? -t : t;
    n.y += n.y >= 0.0 ? -t : t;
    return normalize(n);
  }

  void main() {
    // TODO: extract data from g buffers and do lighting

    vec4 gb0 = texture2D(u_gbuffers[0], v_uv);
    vec4 gb1 = texture2D(u_gbuffers[1], v_uv);
    //vec4 gb2 = texture2D(u_gbuffers[2], v_uv);

    // OPTIMIZED:
    vec3 v_position = gb0.rgb;
    vec3 albedo = vec3(gb0.w, gb1.xy);
    vec3 normal = decodeNormal(gb1.zw);

    // NOT OPTIMIZED:
    // vec3 v_position = gb0.rgb;
    // vec3 albedo = gb1.rgb;
    // vec3 normal = gb2.rgb;

    // vec4 gb3 = texture2D(u_gbuffers[3], v_uv);

    vec4 viewPos = u_viewMatrix * vec4(v_position, 1.0);
    viewPos.z = -viewPos.z;

    float xStride = float(u_screenWidth) / float(${params.xSlices});
    float yStride = float(u_screenHeight) / float(${params.ySlices});
    float zStride = float(u_far - u_near) / float(${params.zSlices});

    int xCluster = int(gl_FragCoord.x / xStride);
    int yCluster = int(gl_FragCoord.y / yStride);
    int zCluster = int((viewPos.z - u_near) / zStride);

    int clusterIdx = xCluster + yCluster * ${params.xSlices} + zCluster * ${params.xSlices} * ${params.ySlices};
    int numClusters = ${params.xSlices} * ${params.ySlices} * ${params.zSlices};
    float u = float(clusterIdx + 1) / float(numClusters + 1);
    int texHeight = int(ceil(float(${params.maxLightsPerCluster} + 1) / 4.0));
    int numLights = int(texture2D(u_clusterbuffer, vec2(u, 0)).r);

    vec3 fragColor = vec3(0.0);

    for (int i = 0; i < ${params.numLights}; ++i) {
      if (i >= numLights) { break; }
      Light light = UnpackLight(int(ExtractFloat(u_clusterbuffer, numClusters, texHeight, clusterIdx, i + 1)));
      float lightDistance = distance(light.position, v_position);
      vec3 L = (light.position - v_position) / lightDistance;

      float lightIntensity = cubicGaussian(2.0 * lightDistance / light.radius);
      float lambertTerm = max(dot(L, normal), 0.0);

      fragColor += albedo * lambertTerm * light.color * vec3(lightIntensity);
    }

    const vec3 ambientLight = vec3(0.025);
    fragColor += albedo * ambientLight;

    gl_FragColor = vec4(fragColor, 1.0);
  }
  `;
}