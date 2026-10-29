import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import '@unif/react-native-design/docs-home.css';

export default function Home(): ReactNode {
  return (
    <Layout
      title="音频采集与实时识别"
      description="按次采集 PCM、管理临时凭证和实时识别，向输入场景交付文字。"
    >
      <main className="unif-home speech-home">
        <section className="hp-hero speech-container">
          <span className="hp-eyebrow">Unif React Native</span>
          <h1 className="hp-title">
            从麦克风，
            <br />
            <span className="accent">到可编辑的文字。</span>
          </h1>
          <p className="hp-tagline">
            按次采集、临时凭证、实时识别与语音输入。宿主掌握身份与文字采用，库处理本轮状态和资源收尾。
          </p>
          <div className="hp-cta-row">
            <Link className="hp-btn hp-btn-primary" to="/docs/quick-start">
              快速开始
            </Link>
            <Link className="hp-btn hp-btn-outline" to="/docs/api/input">
              查看 API
            </Link>
          </div>
        </section>
        <section
          className="speech-container speech-features"
          aria-label="核心能力"
        >
          <article>
            <h2>独立采集</h2>
            <p>
              真实 PCM 格式、开始回执和明确的停止结果，连接现有 Expo Audio。
            </p>
            <Link to="/docs/api/capture">音频采集 →</Link>
          </article>
          <article>
            <h2>实时识别</h2>
            <p>临时凭证在原上下文内复用，逐句交付 partial、final 与终态。</p>
            <Link to="/docs/api/realtime">识别会话 →</Link>
          </article>
          <article>
            <h2>输入轮次</h2>
            <p>权限、取消、接管和麦克风释放共同约束一次文字交付。</p>
            <Link to="/docs/api/input">输入 Hook →</Link>
          </article>
        </section>
        <section className="speech-container speech-example">
          <h2>在真实原生宿主中运行</h2>
          <p>
            iOS／Android 示例包含 Expo Modules
            接线。安装精确版本与配套补丁，再使用服务端签发的临时凭证录音识别。
          </p>
          <Link to="/docs/native-setup">安装依赖与原生补丁 →</Link>
        </section>
      </main>
    </Layout>
  );
}
