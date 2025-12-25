import React, { useState } from 'react';
import { ARScene } from './components/ARScene';

export default function App() {
  const [started, setStarted] = useState(false);

  return (
    <div className="w-full h-screen bg-black text-white overflow-hidden font-sans">
      {!started ? (
        <div className="flex flex-col items-center justify-center w-full h-full bg-gradient-to-br from-gray-900 to-black p-6">
          <div className="max-w-md w-full text-center space-y-8">
            <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
              WebAR Mok
            </h1>
            <p className="text-gray-400 text-lg">
              沉浸式流体粒子互动体验
            </p>
            
            <div className="grid grid-cols-2 gap-4 text-left text-sm text-gray-300 bg-gray-800/50 p-6 rounded-xl border border-gray-700">
               <div>🖐 张开手掌</div><div className="text-cyan-400">能量球体</div>
               <div>✌️ 剪刀手</div><div className="text-cyan-400">"我是 Mok"</div>
               <div>✊ 握拳</div><div className="text-cyan-400">时空圆环</div>
               <div>☝️ 食指</div><div className="text-cyan-400">闪耀星辰</div>
               <div>👍 竖大拇指</div><div className="text-cyan-400">爱心</div>
            </div>

            <button
              onClick={() => setStarted(true)}
              className="group relative inline-flex items-center justify-center px-8 py-3 text-lg font-medium text-white transition-all duration-200 bg-cyan-600 rounded-full hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600"
            >
              <span className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-black"></span>
              <span className="relative">开启体验</span>
              <svg className="w-5 h-5 ml-2 -mr-1 transition-transform group-hover:translate-x-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
            </button>
            <p className="text-xs text-gray-500">体验需要开启摄像头权限</p>
          </div>
        </div>
      ) : (
        <ARScene />
      )}
    </div>
  );
}