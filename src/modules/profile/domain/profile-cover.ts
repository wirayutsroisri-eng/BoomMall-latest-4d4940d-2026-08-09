import { Dimensions } from 'react-native';

/** Matches `coverBanner` height on profile + edit profile screens. */
export const PROFILE_COVER_HEIGHT = 176;

export function profileCoverFrameWidth(screenWidth = Dimensions.get('window').width) {
  return screenWidth;
}
