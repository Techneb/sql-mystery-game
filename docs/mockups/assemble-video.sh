#!/bin/bash
# Part I film, narrated: s1..s6.mp4 (OpenGen clips renamed by shot) + nar1..nar3.mp4 (narrator clips, audio only)
# -> 0.8 s cross-fades, ambience bed, shot 4's dialogue, narration cut per line, subtitles -> part1.mp4 / .webm / .jpg
# Usage: bash assemble-video.sh DIR, where DIR holds the clips plus cormorant-it.ttf (Google Fonts TTF).
# delogo blurs the painted "Sir John Lavery" signature Nano Banana leaves in shots 2 and 6; shot 4 is cropped to the
# two faces because Veo opened the jewel case in it. Cut points come from whisper-cli word timings + silencedetect.
set -e
cd "${1:-.}"
CORM=cormorant-it.ttf
NORM="scale=1280:720,setsar=1,fps=24,format=yuv420p"

# shot timeline: each starts 0.8 s before the previous ends (xfade)
# s1 0-5 | s2 4.2-8.2 | s3 7.4-13.4 | s4 12.6-18.2 | s5 17.4-23.4 | s6 22.6-29.4 (4 s + 2.8 s held)
ffmpeg -v error -y -i s1.mp4 -i s2.mp4 -i s3.mp4 -i s4.mp4 -i s5.mp4 -i s6.mp4 -filter_complex "
[0:v]trim=0:5,setpts=PTS-STARTPTS,$NORM[v0];
[1:v]trim=0:4,setpts=PTS-STARTPTS,$NORM,delogo=x=1120:y=670:w=125:h=48[v1];
[2:v]trim=0:6,setpts=PTS-STARTPTS,$NORM[v2];
[3:v]trim=0:5.6,setpts=PTS-STARTPTS,crop=782:440:250:0,$NORM[v3];
[4:v]trim=0:6,setpts=PTS-STARTPTS,$NORM[v4];
[5:v]trim=0:4,setpts=PTS-STARTPTS,$NORM,delogo=x=6:y=668:w=135:h=48,tpad=stop_mode=clone:stop_duration=2.8[v5];
[v0][v1]xfade=fade:duration=0.8:offset=4.2[x1];[x1][v2]xfade=fade:duration=0.8:offset=7.4[x2];
[x2][v3]xfade=fade:duration=0.8:offset=12.6[x3];[x3][v4]xfade=fade:duration=0.8:offset=17.4[x4];
[x4][v5]xfade=fade:duration=0.8:offset=22.6,fade=in:st=0:d=0.6,fade=out:st=28.6:d=0.8[v]" \
  -map "[v]" -c:v libx264 -crf 14 -preset fast -pix_fmt yuv420p video.mp4

# audio: ambience of each shot (quiet), shot 4's dialogue (full), narration lines (full), placed at absolute times
# a(file,from,to,at,vol,fadein): one placed sound
A=""; IN=""; n=0
add() {  # file start end at volume
  IN="$IN -i $1"
  A="$A[$n:a]atrim=$2:$3,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=$5,afade=t=in:d=0.03,afade=t=out:st=$(awk "BEGIN{print $3-$2-0.15}"):d=0.15,adelay=$(awk "BEGIN{print int($4*1000)}"):all=1[a$n];"
  n=$((n+1))
}
add s1.mp4 0 5 0 0.45
add s2.mp4 0 4 4.2 0.45
add s3.mp4 0 6 7.4 0.45
add s4.mp4 0 5.6 12.6 1.0
add s5.mp4 0 6 17.4 0.45
add s6.mp4 0 4 22.6 0.45
add nar1.mp4 0.00 4.42 0.4 1.0     # Paris. The Gare du Nord, the twentieth of May, 1912.
add nar1.mp4 4.58 7.75 4.95 1.0     # Mr. Rupert Blakeney, of Bath, had a train to catch.
add nar2.mp4 0.00 4.38 8.2 1.0     # Inspector Ganimard was early. Lupin had asked him not to be late.
add nar2.mp4 4.55 5.80 20.6 1.0    # The case was empty.
add nar3.mp4 0.00 5.70 23.1 1.0    # The Blue Star had a train to catch. Lupin was taken. The stone was not.
MIX=""; for k in $(seq 0 $((n-1))); do MIX="$MIX[a$k]"; done
ffmpeg -v error -y $IN -filter_complex "$A${MIX}amix=inputs=$n:normalize=0:duration=longest,apad,atrim=0:29.4,afade=t=out:st=28.4:d=1[a]" \
  -map "[a]" -c:a pcm_s16le audio.wav

# subtitles: one per spoken line (the film may be watched with the sound off)
sub() {  # text start end
  printf '%s' "$1" > "sub$S.txt"
  F="$F,drawtext=fontfile=$CORM:textfile=sub$S.txt:fontsize=46:fontcolor=0xF3E9D2:borderw=2:bordercolor=black@0.55:shadowcolor=black@0.8:shadowx=2:shadowy=2:x=(w-text_w)/2:y=h-text_h-52:enable='between(t,$2,$3)':alpha='if(lt(t,$2+0.3),(t-$2)/0.3,if(gt(t,$3-0.3),($3-t)/0.3,1))'"
  S=$((S+1))
}
F="null"; S=0
sub "Paris. The Gare du Nord, the twentieth of May, 1912." 0.4 4.8
sub "Mr. Rupert Blakeney, of Bath, had a train to catch." 4.95 8.15
sub "Inspector Ganimard was early. Lupin had asked him not to be late." 8.25 12.6
sub "'Monsieur Blakeney. You are under arrest.'" 12.8 16.5
sub "'Delighted, Inspector.'" 16.5 18.2
sub "The case was empty." 20.6 22.3
sub "The Blue Star had a train to catch." 23.1 26.2
sub "Lupin was taken. The stone was not." 26.3 29.2

ffmpeg -v error -y -i video.mp4 -i audio.wav -vf "$F" -c:v libx264 -crf 25 -preset slow -pix_fmt yuv420p \
  -profile:v high -movflags +faststart -c:a aac -b:a 96k -shortest part1.mp4
ffmpeg -v error -y -i part1.mp4 -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -c:a libopus -b:a 64k part1.webm
ffmpeg -v error -y -ss 3.0 -i s6.mp4 -frames:v 1 -vf "$NORM,delogo=x=6:y=668:w=135:h=48" -q:v 4 part1.jpg
rm -f video.mp4 audio.wav sub*.txt
ls -l part1.*
