import { TimerSettings } from '../types';

export enum RatingCategory {
    HyperBullet = 'hyperbullet',
    Bullet = 'bullet',
    Blitz = 'blitz',
    Rapid = 'rapid',
    Classical = 'classical',
    Unlimited = 'unlimited',
    Daily = 'daily',
}

export const RATING_CATEGORIES = Object.values(RatingCategory);

export const getRatingCategory = (settings: TimerSettings): RatingCategory => {
    if (!settings) {
        return RatingCategory.Unlimited;
    }
    if ('daysPerMove' in settings) {
        return RatingCategory.Daily;
    }

    // Per user request, calculate based on (base_minutes + increment_seconds)
    const { initialTime, increment } = settings;
    const categoryValue = (initialTime / 60) + increment;

    if (categoryValue < 1) return RatingCategory.HyperBullet;
    if (categoryValue < 3) return RatingCategory.Bullet;
    if (categoryValue < 8) return RatingCategory.Blitz;
    if (categoryValue < 30) return RatingCategory.Rapid;
    return RatingCategory.Classical;
};
