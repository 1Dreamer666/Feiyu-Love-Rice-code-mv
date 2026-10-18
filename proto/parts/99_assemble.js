/* 总装：按图层顺序调用各部件（集成阶段由主控维护） */
function assembleFish(ctx, S) {
  // 1. 接地投影
  wcWashBlob(ctx, 0, 174, 80, 16, '#233052', 0.26, 101);

  // 2. 身后层
  if (typeof drawTailBehind === 'function') drawTailBehind(ctx, S);
  else if (typeof drawTail === 'function') drawTail(ctx, S);
  if (typeof drawHairBack === 'function') drawHairBack(ctx, S);
  if (typeof drawLegs === 'function') drawLegs(ctx, S);

  // 3. 身体层
  if (typeof drawBody === 'function') drawBody(ctx, S);

  // 4. 裙外可见的鲸尾（压在裙摆/头发之上，避免被完全遮住）
  if (typeof drawTailOver === 'function') drawTailOver(ctx, S);

  // 5. 手臂与头部
  if (typeof drawArms === 'function') drawArms(ctx, S);
  if (typeof drawHead === 'function') drawHead(ctx, S);
  if (typeof drawHairFront === 'function') drawHairFront(ctx, S);
  if (typeof drawAccessories === 'function') drawAccessories(ctx, S);
}
