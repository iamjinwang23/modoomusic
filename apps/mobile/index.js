// 커스텀 entry — track-player 재생 서비스 등록 후 expo-router 로드.
// require 순서 보장(ES import 호이스팅 회피): 서비스 등록 → 라우터.

// 알려진 무해 경고 억제(라이브러리 native require 전에 실행돼야 잡힘):
// track-player 4.1.2 슬립타이머 시그니처 · OAuth 스킴 'mono'(Supabase 등록됨)
const { LogBox } = require('react-native')
LogBox.ignoreLogs([/SleepTimer|sleepWhenActiveTrackReachesEnd/, /Linking scheme 'mono'/])

const TrackPlayer = require('react-native-track-player').default
const { PlaybackService } = require('./src/lib/playback-service')

TrackPlayer.registerPlaybackService(() => PlaybackService)

require('expo-router/entry')
