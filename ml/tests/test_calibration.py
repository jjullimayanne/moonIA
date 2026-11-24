import math

import torch

from moonai_ml.config import load_config
from moonai_ml.models.unet import UNet
from moonai_ml.training.train import calibrated_state, logit_offset


def test_calibrated_head_undoes_pos_weight():
    cfg = load_config("development")
    w = cfg.train.pos_weight
    assert logit_offset(cfg) == math.log(w)
    torch.manual_seed(0)
    model = UNet(filters=8).eval()
    cal = UNet(filters=8).eval()
    cal.load_state_dict(calibrated_state(model, cfg))
    x = torch.rand(1, 1, 64, 64)
    with torch.no_grad():
        p_weighted = torch.sigmoid(model(x))
        p_cal = torch.sigmoid(cal(x))
    # odds of the weighted model are exactly w × the calibrated odds
    ratio = (p_weighted / (1 - p_weighted)) / (p_cal / (1 - p_cal))
    assert torch.allclose(ratio, torch.full_like(ratio, w), rtol=1e-4)
