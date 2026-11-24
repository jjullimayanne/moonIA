"""U-Net following DeepMoon (Silburt et al. 2019, model_train.build_model).

3 encoder levels (F, 2F, 4F filters, two 3×3 conv + ReLU each, 2×2 max-pool), a 4F
bottleneck, 3 decoder levels with nearest upsampling + skip concatenation + dropout,
and a 1×1 conv to one channel. DeepMoon uses F = 112, dropout 0.15, He-normal init and
a sigmoid output; we output logits and apply the sigmoid in the loss
(BCEWithLogits — numerically identical objective, more stable).
"""

from __future__ import annotations

import torch
from torch import nn


def _block(cin: int, cout: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=1), nn.ReLU(inplace=True),
        nn.Conv2d(cout, cout, 3, padding=1), nn.ReLU(inplace=True),
    )


class UNet(nn.Module):
    def __init__(self, filters: int = 112, dropout: float = 0.15):
        super().__init__()
        f = filters
        self.enc1, self.enc2, self.enc3 = _block(1, f), _block(f, 2 * f), _block(2 * f, 4 * f)
        self.pool = nn.MaxPool2d(2)
        self.bottleneck = _block(4 * f, 4 * f)
        self.up = nn.Upsample(scale_factor=2, mode="nearest")
        self.drop = nn.Dropout2d(dropout)
        self.dec3, self.dec2, self.dec1 = _block(8 * f, 2 * f), _block(4 * f, f), _block(2 * f, f)
        self.head = nn.Conv2d(f, 1, 1)
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, nonlinearity="relu")
                nn.init.zeros_(m.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        a1 = self.enc1(x)
        a2 = self.enc2(self.pool(a1))
        a3 = self.enc3(self.pool(a2))
        u = self.bottleneck(self.pool(a3))
        u = self.dec3(self.drop(torch.cat([a3, self.up(u)], 1)))
        u = self.dec2(self.drop(torch.cat([a2, self.up(u)], 1)))
        u = self.dec1(self.drop(torch.cat([a1, self.up(u)], 1)))
        return self.head(u)  # logits


# layers whose mean activation is exported for the Training Studio
ACTIVATION_LAYERS = ("enc1", "enc3", "bottleneck", "dec1")


def describe(model: UNet, filters: int) -> dict:
    return {
        "name": "U-Net (DeepMoon)",
        "params": sum(p.numel() for p in model.parameters()),
        "levels": 3,
        "filters": [filters, 2 * filters, 4 * filters, 4 * filters],
        "input": [1, 1, 256, 256],
        "output": "logits [1,1,256,256]; sigmoid → rim probability",
        "reference": "Silburt et al. 2019, Icarus 317:27-38",
    }
