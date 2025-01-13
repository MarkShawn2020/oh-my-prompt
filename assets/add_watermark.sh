#!/bin/bash

# 设置输入输出文件
input_image="demo.gif"
output_image="demo2.gif"

# 设置文字内容
text1="Oh My Prompt"
text2="AI IDE 多 prompt 插件"

# 设置日期格式和样式
current_date=$(date '+%Y-%m-%d')
date_font_size=24
date_padding=10
date_height=50
date_width=140
theme_color="rgb(216,74,27)"

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

# 创建水印图层
magick \( -size "${width}x${strip_height}" \
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
     \( -size "${date_width}x${date_height}" \
        xc:none \
        -fill white \
        -draw "path 'M 0,${date_height} L ${date_width},${date_height} L ${date_width},0 Q ${date_width},${date_height} 0,${date_height} Z'" \
        -fill "$theme_color" \
        -font "$font_type" \
        -pointsize $date_font_size \
        -gravity center \
        -annotate +0+5 "$current_date" \
     \) \
     -gravity northeast \
     -geometry +${date_padding}+0 \
     -composite \
  \) watermark.png

# 为GIF的每一帧添加水印
if [[ "$input_image" =~ \.gif$ ]]; then
  magick "$input_image" \
    -coalesce \
    null: watermark.png \
    -gravity center \
    -compose over \
    -layers composite \
    -layers optimize \
    "$output_image"
else
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
fi

# 清理临时文件
if [ -f "watermark.png" ]; then
  rm watermark.png
fi

echo "水印添加完成！输出文件: $output_image"