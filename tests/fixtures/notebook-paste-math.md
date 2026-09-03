### 一、定积分换元：区间再现公式

> **核心考点**：$\int_0^\pi x f(\sin x)dx = \frac{\pi}{2}\int_0^\pi f(\sin x)dx$

1. **观察**：积分限 $[0, \pi]$，被积函数含 $x \cdot f(\sin x)$。
2. **触发词**："$0$ 到 $\pi$" → **区间再现！**
3. **操作**：令 $x = \pi - t$，则 $dx = -dt$。

$$
\begin{aligned}
I &= \int_\pi^0 \frac{(\pi-t)\sin(\pi-t)}{1+\cos^2(\pi-t)} (-dt) \\
&= \int_0^\pi \frac{(\pi-t)\sin t}{1+\cos^2 t} dt
\end{aligned}
$$

\[
f\left(x+\frac1x\right)=x^2+\frac1{x^2}
\]

| 换元类型 | 训练目标 |
| :--- | :--- |
| 区间再现 | 形成条件反射 |
