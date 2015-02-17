{
  "targets": [
    {
      "target_name": "opengl",
      "sources": [
        "src/opengl.cc"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
        "src"
      ],
      "cflags": [
        "-Wall",
        "-O3",
        "-std=c++11"
      ],
      "link_settings": {
        "libraries": [
          "-lGLEW"
        ]
      }
    }
  ]
}
