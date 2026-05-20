# 3D model contract

`public/roboarm.glb` is part of the control contract. The viewer expects stable node names and joint pivots; changing them can break already working Three.js control.

Required nodes:

- `base`
- `shoulder`
- `elbow`
- `wrist`
- `finger_l`
- `finger_r`
- `OLED_SCREEN`

Current rotation mapping in `src/viewer3d.ts`:

- S1/base: `rotation.y = degToRad(angle)`
- S2/shoulder: `rotation.x = degToRad(angle - 90)`
- S3/elbow: `rotation.x = degToRad(angle - 90)`
- S4/wrist: `rotation.y = degToRad(angle)`
- S5/gripper: `finger_l.rotation.z` and `finger_r.rotation.z` move symmetrically

Before replacing the GLB, run:

```bash
npm run check:model
```

Then verify the UI manually by moving all five sliders through their min, midpoint, and max values.
