// react-native-svg-transformer: .svg를 React 컴포넌트로 import
declare module '*.svg' {
  import type { FC } from 'react'
  import type { SvgProps } from 'react-native-svg'
  const content: FC<SvgProps>
  export default content
}
