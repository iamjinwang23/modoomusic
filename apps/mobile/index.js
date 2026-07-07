// 커스텀 entry — track-player 재생 서비스 등록 후 expo-router 로드.
// require 순서 보장(ES import 호이스팅 회피): 서비스 등록 → 라우터.
const TrackPlayer = require('react-native-track-player').default
const { PlaybackService } = require('./src/lib/playback-service')

TrackPlayer.registerPlaybackService(() => PlaybackService)

require('expo-router/entry')
