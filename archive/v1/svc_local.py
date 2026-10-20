# -*- coding: utf-8 -*-
"""Seed-VC 本地推理：模型已手工下载到 build/svc/models/，绕过 huggingface_hub 下载。

用法：
  python tools/svc_local.py --source X.wav --target Y.wav --output outdir [--diffusion-steps 40]
"""
import os, sys, argparse, warnings
warnings.simplefilter('ignore')

MODELS = os.path.abspath('build/svc/models')

# ---- 1. 让 seed_vc 从本地取权重，不联网 ----
import huggingface_hub
import seed_vc.hf_utils as hf_utils

_LOCAL = {
    ('Plachta/Seed-VC', 'DiT_seed_v2_uvit_whisper_base_f0_44k_bigvgan_pruned_ft_ema_v2.pth'): os.path.join(MODELS, 'dit_f0_44k.pth'),
    ('Plachta/Seed-VC', 'config_dit_mel_seed_uvit_whisper_base_f0_44k.yml'): os.path.join(MODELS, 'config_f0_44k.yml'),
    ('lj1995/VoiceConversionWebUI', 'rmvpe.pt'): os.path.join(MODELS, 'rmvpe.pt'),
    ('funasr/campplus', 'campplus_cn_common.bin'): os.path.join(MODELS, 'campplus_cn_common.bin'),
}

def _local_load(repo_id, model_filename='pytorch_model.bin', config_filename=None):
    key = (repo_id, model_filename)
    if key not in _LOCAL:
        raise SystemExit(f'未预置的模型：{key}')
    mp = _LOCAL[key]
    if not os.path.isfile(mp):
        raise SystemExit(f'模型文件缺失：{mp}')
    if config_filename is None:
        return mp
    return mp, _LOCAL[(repo_id, config_filename)]

hf_utils.load_custom_model_from_hf = _local_load

# ---- 2. bigvgan 也从本地加载 ----
# 注意：huggingface_hub>=1.x 改了 PyTorchModelHubMixin 的签名，
# 与 seed_vc 里 BigVGAN._from_pretrained 的旧签名不兼容，所以整个绕过。
import torch
from seed_vc.modules.bigvgan import bigvgan as _bv
from seed_vc.modules.bigvgan.bigvgan import load_hparams_from_json

_BV_DIR = os.path.join(MODELS, 'bigvgan_44k')

def _local_bigvgan_from_pretrained(cls, model_id=None, use_cuda_kernel=False, **kw):
    h = load_hparams_from_json(os.path.join(_BV_DIR, 'config.json'))
    model = cls(h, use_cuda_kernel=use_cuda_kernel)
    ckpt = torch.load(os.path.join(_BV_DIR, 'bigvgan_generator.pt'), map_location='cpu')
    try:
        model.load_state_dict(ckpt['generator'])
    except RuntimeError:
        model.remove_weight_norm()
        model.load_state_dict(ckpt['generator'])
    return model

_bv.BigVGAN.from_pretrained = classmethod(_local_bigvgan_from_pretrained)

# ---- 3. 转调 seed_vc.inference 的 main ----
import seed_vc.inference as infer
infer.load_custom_model_from_hf = _local_load

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True)
    ap.add_argument('--target', required=True)
    ap.add_argument('--output', default='build/svc/out')
    ap.add_argument('--diffusion-steps', type=int, default=40)
    ap.add_argument('--length-adjust', type=float, default=1.0)
    ap.add_argument('--inference-cfg-rate', type=float, default=0.7)
    ap.add_argument('--f0-condition', type=infer.str2bool, default=True)
    ap.add_argument('--auto-f0-adjust', type=infer.str2bool, default=False)
    ap.add_argument('--semi-tone-shift', type=float, default=0)
    ap.add_argument('--fp16', type=infer.str2bool, default=True)
    ap.add_argument('--checkpoint', default=os.path.join(MODELS, 'dit_f0_44k.pth'))
    ap.add_argument('--config', default=os.path.join(MODELS, 'config_f0_44k.yml'))
    infer.main(ap.parse_args())
