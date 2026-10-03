#!/bin/bash
# Part I film: s1..s6.mp4 (OpenGen clips renamed by shot) -> captions -> 0.8 s cross-fades -> part1.mp4 / part1.webm / part1.jpg
# Usage: bash assemble-video.sh DIR, where DIR holds the clips plus cormorant-it.ttf and special-elite.ttf (Google Fonts TTFs).
# delogo blurs the painted "Sir John Lavery" signature Nano Banana left in shots 2 and 6; Part II prompts now forbid it.
set -e
cd "${1:-.}"
X=0.8
# caption files (textfile= avoids quoting apostrophes)
printf '%s' "GARE DU NORD, 20 MAY 1912, 09:10" > t1.txt
printf '%s' "Mr. Blakeney had a train to catch." > t2.txt
printf '%s' "Inspector Ganimard had not slept in three days." > t3.txt
printf '%s' "'You have my name, Inspector.'" > t4.txt
printf '%s' "The case was empty." > t5.txt
printf '%s' "'The Blue Star has a train to catch.'" > t6.txt
printf '%s' "Part I closed. The stone was not." > t7.txt

# cap FILE FONT SIZE START END: a centred line near the bottom, fading in and out over 0.4 s
cap() {
  local a="if(lt(t,$4+0.4),(t-$4)/0.4,if(gt(t,$5-0.4),($5-t)/0.4,1))"
  echo "drawtext=fontfile=$2:textfile=$1:fontsize=$3:fontcolor=0xF3E9D2:borderw=2:bordercolor=black@0.55:shadowcolor=black@0.8:shadowx=2:shadowy=2:x=(w-text_w)/2:y=h-text_h-56:enable='between(t,$4,$5)':alpha='$a'"
}
CORM=cormorant-it.ttf; ELITE=special-elite.ttf
NORM="scale=1280:720,setsar=1,fps=24,format=yuv420p"
# clip: IN DURATION VIDEOFILTER
clip() {
  ffmpeg -v error -y -i "$1" -t "$2" -vf "$NORM,$3" -af "aresample=48000,aformat=channel_layouts=stereo" \
    -c:v libx264 -crf 16 -preset fast -c:a aac -b:a 192k "n_$1"
}
clip s1.mp4 4 "$(cap t1.txt $ELITE 38 0.5 3.1)"
clip s2.mp4 4 "delogo=x=1120:y=670:w=125:h=48,$(cap t2.txt $CORM 50 0.5 3.1)"
clip s3.mp4 6 "$(cap t3.txt $CORM 50 0.8 5.1)"
clip s4.mp4 4 "$(cap t4.txt $CORM 50 0.5 3.1)"
clip s5.mp4 6 "$(cap t5.txt $CORM 50 1.5 5.1)"
# last shot: held 1.5 s on its last frame so the closing line can be read
clip s6.mp4 5.5 "delogo=x=6:y=668:w=135:h=48,tpad=stop_mode=clone:stop_duration=1.5,$(cap t6.txt $CORM 50 0.5 2.4),$(cap t7.txt $CORM 54 2.7 5.4)"
ffmpeg -v error -y -i n_s6.mp4 -af "apad" -t 5.5 -c:v copy -c:a aac -b:a 192k n_s6p.mp4 && mv n_s6p.mp4 n_s6.mp4

# cross-fades: offsets are the running sum of durations minus one fade per join
ffmpeg -v error -y -i n_s1.mp4 -i n_s2.mp4 -i n_s3.mp4 -i n_s4.mp4 -i n_s5.mp4 -i n_s6.mp4 -filter_complex "
[0:v][1:v]xfade=fade:duration=$X:offset=3.2[v1];[v1][2:v]xfade=fade:duration=$X:offset=6.4[v2];
[v2][3:v]xfade=fade:duration=$X:offset=11.6[v3];[v3][4:v]xfade=fade:duration=$X:offset=14.8[v4];
[v4][5:v]xfade=fade:duration=$X:offset=20.0,fade=in:st=0:d=0.6,fade=out:st=24.7:d=0.8[v];
[0:a][1:a]acrossfade=d=$X[a1];[a1][2:a]acrossfade=d=$X[a2];[a2][3:a]acrossfade=d=$X[a3];
[a3][4:a]acrossfade=d=$X[a4];[a4][5:a]acrossfade=d=$X,afade=t=out:st=24.5:d=1[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 25 -preset slow -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -c:a aac -b:a 96k part1.mp4
ffmpeg -v error -y -i part1.mp4 -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -c:a libopus -b:a 64k part1.webm
ffmpeg -v error -y -ss 2.0 -i s4.mp4 -frames:v 1 -vf scale=1280:720 -q:v 4 part1.jpg
ls -l part1.*
