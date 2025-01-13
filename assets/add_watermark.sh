#!/bin/bash

# 设置输入输出文件
input_image="logo.jpeg"
output_image="logo2.jpeg"

# 设置文字内容
text1="Oh My Prompt"
text2="AI IDE 多 prompt 插件"

# 设置字体大小和类型
font_size1=60
font_size2=40
font_type="Source-Han-Serif-SC-VF-Heavy"

# 设置长条背景的高度
strip_height=200

# 获取图片尺寸
image_size=$(magick identify -format "%wx%h" "$input_image")
width=$(echo $image_size | cut -d'x' -f1)
height=$(echo $image_size | cut -d'x' -f2)

# 创建半透明橙红色背景的文字水印
magick "$input_image" \
  \( -size "${width}x${strip_height}" \
     xc:"rgba(216,74,27,0.9)" \
     -fill white \
     -stroke none \
     -font "$font_type" \
     -pointsize $font_size1 \
     -gravity north \
     -annotate +0+25 "$text1" \
     -pointsize $font_size2 \
     -gravity south \
     -annotate +0+25 "$text2" \
  \) \
  -gravity center \
  -composite \
  "$output_image"

echo "水印添加完成！输出文件: $output_image"