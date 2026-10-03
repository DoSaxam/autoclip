"""Face detection & tracking via OpenCV YuNet.
Samples frames every ~0.25s, picks the largest/most-central face,
smooths the trajectory with a moving average, emits clip-relative keyframes."""
import cv2
import numpy as np

from . import config


class FaceTracker:
    def __init__(self, model_path=None):
        self.detector = cv2.FaceDetectorYN.create(
            model_path or config.FACE_MODEL_PATH, "", (320, 320),
            score_threshold=0.6, top_k=3
        )

    def track(self, video_path: str, start: float, end: float,
              progress_cb=None, cancel_cb=None):
        """Returns list of (t, cx, cy) clip-relative keyframes (smoothed), or [] if no faces."""
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return []
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if src_w == 0 or src_h == 0:
            cap.release()
            return []

        sample_step = 0.25  # seconds
        raw = []  # (t, cx, cy) or None per sample
        t = 0.0
        dur = end - start
        while t < dur:
            if cancel_cb and cancel_cb():
                cap.release()
                raise InterruptedError("canceled")
            abs_t = start + t
            cap.set(cv2.CAP_PROP_POS_MSEC, abs_t * 1000)
            ok, frame = cap.read()
            if not ok:
                raw.append((t, None))
                t += sample_step
                continue
            h, w = frame.shape[:2]
            small = cv2.resize(frame, (480, int(h * 480 / w))) if w > 480 else frame
            scale = w / small.shape[1]
            self.detector.setInputSize((small.shape[1], small.shape[0]))
            n, faces = self.detector.detect(small)
            if faces is None or len(faces) == 0:
                raw.append((t, None))
            else:
                # pick face with largest area; tie-break by centrality
                best, best_score = None, -1
                for f in faces:
                    x, y, fw, fh = f[0] * scale, f[1] * scale, f[2] * scale, f[3] * scale
                    cx, cy = x + fw / 2, y + fh / 2
                    area = fw * fh
                    center_bias = 1.0 - abs(cx - w / 2) / (w / 2) * 0.3
                    score = area * center_bias
                    if score > best_score:
                        best_score, best = score, (cx, cy)
                raw.append((t, best))
            if progress_cb:
                progress_cb(min(1.0, t / max(dur, 0.1)))
            t += sample_step
        cap.release()

        # forward-fill missing detections (hold last known face up to 2s)
        filled = []
        last = None
        last_t = -10
        for t, pt in raw:
            if pt is not None:
                last, last_t = pt, t
            elif last is not None and (t - last_t) <= 2.0:
                pass  # keep `last`
            else:
                last = None
            filled.append((t, last))

        # drop leading/trailing Nones; keep None holes as center fallback
        pts = []
        for t, pt in filled:
            if pt is None:
                pts.append((t, src_w / 2, src_h * 0.40))  # neutral center-top
            else:
                pts.append((t, pt[0], pt[1]))

        if not any(p is not None for _, p in raw):
            return []  # no faces at all -> caller uses static crop

        # moving average smoothing (window ~1.5s = 6 samples each side)
        window = 6
        cx = np.array([p[1] for p in pts])
        cy = np.array([p[2] for p in pts])
        ts = [p[0] for p in pts]
        kernel = np.ones(window * 2 + 1)
        cx_s = np.convolve(np.pad(cx, (window, window), mode="edge"), kernel, "valid") / kernel.sum()
        cy_s = np.convolve(np.pad(cy, (window, window), mode="edge"), kernel, "valid") / kernel.sum()

        # decimate to 0.5s keyframes after smoothing
        keyframes = []
        next_t = 0.0
        for i, t in enumerate(ts):
            if t >= next_t - 1e-6:
                keyframes.append((round(t, 3), float(cx_s[i]), float(cy_s[i])))
                next_t += 0.5
        if keyframes and keyframes[0][0] > 0:
            keyframes.insert(0, (0.0, keyframes[0][1], keyframes[0][2]))
        return keyframes


def has_face_model() -> bool:
    import os
    return os.path.exists(config.FACE_MODEL_PATH)
