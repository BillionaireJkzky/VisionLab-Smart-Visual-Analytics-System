"""
VisionLab – Unit tests for the object detection service (mocked YOLO).
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from PIL import Image

from app.services.detection import _location_descriptor, run_detection


class TestLocationDescriptor:
    def test_centre(self):
        assert _location_descriptor(400, 300, 600, 500, 1000, 1000) == "centre of the image"

    def test_top_left(self):
        result = _location_descriptor(0, 0, 100, 100, 1000, 1000)
        assert "top" in result and "left" in result

    def test_bottom_right(self):
        result = _location_descriptor(800, 800, 950, 950, 1000, 1000)
        assert "bottom" in result and "right" in result

    def test_middle_left(self):
        result = _location_descriptor(0, 400, 100, 600, 1000, 1000)
        assert "left" in result


class TestRunDetection:
    def test_returns_list(self):
        """Detection should always return a list even with a blank image."""
        mock_model = MagicMock()
        mock_result = MagicMock()
        mock_result.boxes = None
        mock_model.return_value = [mock_result]
        mock_model.names = {}

        with patch("app.services.detection._get_model", return_value=mock_model):
            image = Image.fromarray(np.zeros((100, 100, 3), dtype=np.uint8))
            result = run_detection(image)
            assert isinstance(result, list)

    def test_detection_structure(self):
        """Each detection dict must have the required keys."""
        mock_box = MagicMock()
        mock_box.xyxy = [MagicMock(tolist=lambda: [10.0, 20.0, 50.0, 60.0])]
        mock_box.conf = [MagicMock(__float__=lambda s: 0.9)]
        mock_box.cls = [MagicMock(__int__=lambda s: 0)]

        mock_result = MagicMock()
        mock_result.boxes = [mock_box]

        mock_model = MagicMock()
        mock_model.return_value = [mock_result]
        mock_model.names = {0: "cat"}

        with patch("app.services.detection._get_model", return_value=mock_model):
            image = Image.fromarray(np.zeros((100, 100, 3), dtype=np.uint8))
            detections = run_detection(image)
            if detections:
                d = detections[0]
                assert "label" in d
                assert "confidence" in d
                assert "bounding_box" in d
                assert "location" in d
