<script setup lang="ts">
import Card from './components/Card.vue';
import Button from './ds/Button.vue';

// 한글 주석: 템플릿 앞에 스크립트 블록이 있어도 위치가 파일 기준인지 확인하는 용도다.
const items = ['색', '간격', '크기', '글꼴'];
</script>

<template>
  <main class="page">
    <!-- 한글 주석 뒤의 요소 위치 검증 -->
    <h1 class="title">DOMirror Vue 예제</h1>
    <p class="lead">요소를 클릭하면 소스 위치를 찾을 수 있습니다.</p>
    <ul class="list">
      <li v-for="item in items" :key="item" class="list-item">{{ item }}</li>
    </ul>
    <Card title="카드">
      <p>카드 본문입니다.</p>
    </Card>
    <Button label="디자인 시스템 버튼" />
  </main>
</template>
