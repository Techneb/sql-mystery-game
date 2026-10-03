#!/bin/bash
# Part II film: s1..s7.mp4 (OpenGen clips renamed by shot, see video-part2.md) + nar.mp4 (narrator, audio only)
# -> 0.8 s cross-fades, each clip's own sound (the dialogue is lip-synced in it), narrator lines, subtitles
# -> part2.mp4 / .webm / .jpg.  Usage: bash assemble-video-part2.sh DIR (DIR also holds cormorant-it.ttf).
# Shots whose speech runs to their last frame are held (tpad) so the next shot's voice never overlaps it.
# delogo blurs the painted "J. Lavery" signature in shots 5 and 6. Cut points: whisper word timings.
set -e
cd "${1:-.}"
CORM=cormorant-it.ttf
NORM="scale=1280:720,setsar=1,fps=24,format=yuv420p"

# shot (clip length + hold) and start:  s1 4+2.2 @0 | s2 6 @5.4 | s3 8+1 @10.6 | s4 6+0.6 @18.8
#                                      s5 6 @24.6 | s6 4 @29.8 | s7 6+2 @33.0 | end 41.0
ffmpeg -v error -y -i s1.mp4 -i s2.mp4 -i s3.mp4 -i s4.mp4 -i s5.mp4 -i s6.mp4 -i s7.mp4 -filter_complex "
[0:v]$NORM,tpad=stop_mode=clone:stop_duration=2.2[v0];
[1:v]$NORM[v1];
[2:v]$NORM,tpad=stop_mode=clone:stop_duration=1[v2];
[3:v]$NORM,tpad=stop_mode=clone:stop_duration=0.6[v3];
[4:v]$NORM,delogo=x=1155:y=668:w=110:h=46[v4];
[5:v]$NORM,delogo=x=1188:y=670:w=88:h=46[v5];
[6:v]$NORM,tpad=stop_mode=clone:stop_duration=2[v6];
[v0][v1]xfade=fade:duration=0.8:offset=5.4[x1];[x1][v2]xfade=fade:duration=0.8:offset=10.6[x2];
[x2][v3]xfade=fade:duration=0.8:offset=18.8[x3];[x3][v4]xfade=fade:duration=0.8:offset=24.6[x4];
[x4][v5]xfade=fade:duration=0.8:offset=29.8[x5];[x5][v6]xfade=fade:duration=0.8:offset=33.0,
fade=in:st=0:d=0.6,fade=out:st=40.2:d=0.8[v]" \
  -map "[v]" -c:v libx264 -crf 14 -preset fast -pix_fmt yuv420p video.mp4

A=""; IN=""; n=0
add() {  # file start end at volume
  IN="$IN -i $1"
  A="$A[$n:a]atrim=$2:$3,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=$5,afade=t=in:d=0.05,afade=t=out:st=$(awk "BEGIN{print $3-$2-0.3}"):d=0.3,adelay=$(awk "BEGIN{print int($4*1000)}"):all=1[a$n];"
  n=$((n+1))
}
add s1.mp4 0 4 0 0.5
add s2.mp4 0 6 5.4 1.0          # Tea, Inspector? / No, thank you, Madame.
add s3.mp4 0 8 10.6 1.0         # Sold for forty thousand... / Arithmetic... / Madame la Comtesse, you are under arrest.
add s4.mp4 0 6 18.8 1.0         # I do hope your prison is warm, Inspector. / Case closed. Twice.
add s5.mp4 0 6 24.6 1.0         # To the Prefecture of Police, Paris. For the curious clerk.
add s6.mp4 0 4 29.8 0.5
add s7.mp4 0 6 33.0 1.0         # Your new desk, clerk. It has a window. Do not get used to it.
add nar.mp4 0.00 4.95 0.3 1.0   # Forty thousand francs went through seven banks. They came home to the Comtesse.
add nar.mp4 4.92 7.95 30.0 1.0  # Enclosed, a photograph. No message.
MIX=""; for k in $(seq 0 $((n-1))); do MIX="$MIX[a$k]"; done
ffmpeg -v error -y $IN -filter_complex "$A${MIX}amix=inputs=$n:normalize=0:duration=longest,apad,atrim=0:41,afade=t=out:st=40:d=1[a]" \
  -map "[a]" -c:a pcm_s16le audio.wav

sub() {  # text start end
  printf '%s' "$1" > "sub$S.txt"
  F="$F,drawtext=fontfile=$CORM:textfile=sub$S.txt:fontsize=44:fontcolor=0xF3E9D2:borderw=2:bordercolor=black@0.55:shadowcolor=black@0.8:shadowx=2:shadowy=2:x=(w-text_w)/2:y=h-text_h-52:enable='between(t,$2,$3)':alpha='if(lt(t,$2+0.3),(t-$2)/0.3,if(gt(t,$3-0.3),($3-t)/0.3,1))'"
  S=$((S+1))
}
F="null"; S=0
sub "Forty thousand francs went through seven banks." 0.3 3.25
sub "They came home to the Comtesse." 3.25 5.4
sub "'Tea, Inspector?'" 5.5 6.8
sub "'No, thank you, Madame.'" 6.8 9.0
sub "'Sold for forty thousand. Insured for three hundred.'" 10.6 14.0
sub "'Arithmetic, Inspector.'" 14.0 15.65
sub "'Madame la Comtesse, you are under arrest.'" 15.65 19.4
sub "'I do hope your prison is warm, Inspector.'" 19.4 22.0
sub "'Case closed. Twice.'" 22.0 24.6
sub "'To the Prefecture of Police, Paris. For the curious clerk.'" 24.7 28.8
sub "Enclosed, a photograph. No message." 30.0 33.0
sub "'Your new desk, clerk. It has a window.'" 33.0 37.3
sub "'Do not get used to it.'" 37.3 40.0

ffmpeg -v error -y -i video.mp4 -i audio.wav -vf "$F" -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p \
  -profile:v high -movflags +faststart -c:a aac -b:a 96k -shortest part2.mp4
ffmpeg -v error -y -i part2.mp4 -c:v libvpx-vp9 -crf 37 -b:v 0 -row-mt 1 -c:a libopus -b:a 64k part2.webm
ffmpeg -v error -y -ss 4 -i s4.mp4 -frames:v 1 -vf "$NORM" -q:v 4 part2.jpg
rm -f video.mp4 audio.wav sub*.txt
ls -l part2.*
