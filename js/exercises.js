/* Seeded exercise library + suggested starter workouts.
   Anything you type that isn't here gets added to the library automatically. */

export const SEED_EXERCISES = [
  // --- push ---
  { name: 'Bench Press', type: 'push' },
  { name: 'Incline Bench Press', type: 'push' },
  { name: 'Dumbbell Bench Press', type: 'push' },
  { name: 'Incline Dumbbell Press', type: 'push' },
  { name: 'Overhead Press', type: 'push' },
  { name: 'Seated Dumbbell Shoulder Press', type: 'push' },
  { name: 'Machine Chest Press', type: 'push' },
  { name: 'Cable Fly', type: 'push' },
  { name: 'Pec Deck', type: 'push' },
  { name: 'Lateral Raise', type: 'push' },
  { name: 'Cable Lateral Raise', type: 'push' },
  { name: 'Triceps Pushdown', type: 'push' },
  { name: 'Overhead Triceps Extension', type: 'push' },
  { name: 'Skull Crushers', type: 'push' },
  { name: 'Dips', type: 'push' },
  { name: 'Close-Grip Bench Press', type: 'push' },

  // --- pull ---
  { name: 'Deadlift', type: 'pull' },
  { name: 'Pull-Up', type: 'pull' },
  { name: 'Chin-Up', type: 'pull' },
  { name: 'Lat Pulldown', type: 'pull' },
  { name: 'Barbell Row', type: 'pull' },
  { name: 'Dumbbell Row', type: 'pull' },
  { name: 'Seated Cable Row', type: 'pull' },
  { name: 'Chest-Supported Row', type: 'pull' },
  { name: 'T-Bar Row', type: 'pull' },
  { name: 'Face Pull', type: 'pull' },
  { name: 'Rear Delt Fly', type: 'pull' },
  { name: 'Barbell Curl', type: 'pull' },
  { name: 'Dumbbell Curl', type: 'pull' },
  { name: 'Hammer Curl', type: 'pull' },
  { name: 'Preacher Curl', type: 'pull' },
  { name: 'Cable Curl', type: 'pull' },
  { name: 'Shrugs', type: 'pull' },

  // --- legs ---
  { name: 'Back Squat', type: 'legs' },
  { name: 'Front Squat', type: 'legs' },
  { name: 'Hack Squat', type: 'legs' },
  { name: 'Leg Press', type: 'legs' },
  { name: 'Romanian Deadlift', type: 'legs' },
  { name: 'Bulgarian Split Squat', type: 'legs' },
  { name: 'Walking Lunge', type: 'legs' },
  { name: 'Leg Extension', type: 'legs' },
  { name: 'Leg Curl', type: 'legs' },
  { name: 'Seated Leg Curl', type: 'legs' },
  { name: 'Hip Thrust', type: 'legs' },
  { name: 'Calf Raise', type: 'legs' },
  { name: 'Seated Calf Raise', type: 'legs' },
  { name: 'Goblet Squat', type: 'legs' },

  // --- abs ---
  { name: 'Hanging Leg Raise', type: 'abs' },
  { name: 'Cable Crunch', type: 'abs' },
  { name: 'Plank', type: 'abs' },
  { name: 'Ab Wheel Rollout', type: 'abs' },
  { name: 'Russian Twist', type: 'abs' },
  { name: 'Decline Sit-Up', type: 'abs' },
  { name: 'Leg Raise', type: 'abs' },
  { name: 'Machine Crunch', type: 'abs' },
  { name: 'Bicycle Crunch', type: 'abs' },
  { name: 'Side Plank', type: 'abs' },

  // --- cardio (logged in minutes / km) ---
  { name: 'Treadmill', type: 'cardio' },
  { name: 'Incline Walk', type: 'cardio' },
  { name: 'Stationary Bike', type: 'cardio' },
  { name: 'Rowing Machine', type: 'cardio' },
  { name: 'Stairmaster', type: 'cardio' },
  { name: 'Elliptical', type: 'cardio' },
  { name: 'Outdoor Run', type: 'cardio' },
  { name: 'Jump Rope', type: 'cardio' }
];

/* Offered during first-run setup — one workout per type, fully editable after.
   Templates list exercises only; sets and reps are entered when you log. */
export const STARTER_TEMPLATES = [
  {
    name: 'Push', type: 'push', exercises: [
      'Bench Press', 'Incline Dumbbell Press', 'Overhead Press',
      'Lateral Raise', 'Triceps Pushdown'
    ]
  },
  {
    name: 'Pull', type: 'pull', exercises: [
      'Pull-Up', 'Barbell Row', 'Seated Cable Row',
      'Face Pull', 'Barbell Curl'
    ]
  },
  {
    name: 'Legs', type: 'legs', exercises: [
      'Back Squat', 'Romanian Deadlift', 'Leg Press',
      'Leg Curl', 'Calf Raise'
    ]
  },
  {
    name: 'Abs', type: 'abs', exercises: [
      'Hanging Leg Raise', 'Cable Crunch', 'Ab Wheel Rollout', 'Plank'
    ]
  },
  {
    name: 'Cardio', type: 'cardio', exercises: [
      'Treadmill'
    ]
  }
];
