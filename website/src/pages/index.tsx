import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import '@unif/react-native-design/docs-home.css';

export default function Home(): ReactNode {
  return (
    <Layout
      title="音频采集与实时识别"
      description="为 React Native 应用采集 PCM 音频、管理临时凭证并实时转写，提供可组合的语音输入 Hook。"
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
            采集麦克风音频并实时转写，通过 Hook
            处理开始、停止与取消。应用负责权限、凭证请求及文字采用。
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
            <p>
              在同一身份中复用临时凭证，逐句交付识别中的文字、定稿及结束结果。
            </p>
            <Link to="/docs/api/realtime">识别会话 →</Link>
          </article>
          <article>
            <h2>语音输入</h2>
            <p>
              协调权限、识别和采集，支持停止、取消与新输入接管，并等待麦克风释放。
            </p>
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
