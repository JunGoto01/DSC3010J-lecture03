# DSC3010J 第3回
# Titanic-inspired classroom competition：公開repository用の学生スクリプト
#
# このデータは授業用に作った合成データで、実在の乗客記録ではありません。
# このファイルは、公開repositoryの一番上のフォルダから実行してください。
# 「#」から右は人間向けの説明です。Rはコメントとして読み飛ばします。


# このスクリプトの流れ ------------------------------------------------------
#
#   train と challenge
#          ↓
#   STEP 1  model       ：trainの正解から予測規則を学ぶ
#          ↓
#   STEP 2  probability ：challengeの各人について0〜1の確率を出す
#          ↓
#   STEP 3  prediction  ：確率を提出用の0/1へ変える
#
# 上のSTEPで作ったものを、次のSTEPが使います。
# そのため、このファイルは上から下へ順番に実行します。
# 授業用Webサイトでコードが三つの欄に分かれていても、同じ一つのR作業領域で
# つながっています。ページを再読み込みすると、その作業領域は最初に戻ります。


# 準備：授業システムが二つの表を読み込む -------------------------------
# trainには乗客情報と正解Survivedがあります。
# challengeには同じ種類の乗客情報がありますが、正解Survivedはありません。
train <- read.csv(
  "data/raw/titanic_train.csv",
  na.strings = ""
)

challenge <- read.csv(
  "data/raw/titanic_challenge.csv",
  na.strings = ""
)


# STEP 1：trainからロジスティック回帰の規則を学ぶ -----------------------
# glm()は、trainの正解に合うように予測規則の重みを調整します。
# glm()の中では、次の作業が行われます。
#   1. PclassとSexへ、仮の重みを置く。
#   2. その重みで、trainの各人の生存確率を計算する。
#   3. 計算した確率と、その人の正解Survived（0または1）を比べる。
#   4. 正解が1の人の確率は高く、0の人の確率は低くなるよう重みを直す。
# この調整を630人全体に合うように繰り返し、共通の規則を作ります。
# 一人ずつの正解を丸暗記するのではなく、全員に使える少数の重みにまとめます。
#
# Survived ~ Pclass + Sex は、
# 「Survivedを、PclassとSexを手がかりに予測する」と読みます。
# 「+」は手がかりを二つ使うという記号で、値の足し算ではありません。
# Pclassは今回、1・2・3という数値のまま使います。
# Sexは文字のグループなので、glm()がグループの違いとして扱います。
# family = binomial()は、正解が0/1のロジスティック回帰という指定です。
model <- glm(
  Survived ~ Pclass + Sex,
  data = train,
  family = binomial()
)

# modelには、trainの630人と正解を見て学んだ重み一式が保存されました。
# modelを作る前にSTEP 2を実行しても、まだ使う規則がないので動きません。


# STEP 2：同じ規則でchallengeの確率を出す ------------------------------
# predict()は、STEP 1で作ったmodelをchallengeの各行へ適用します。
# newdata = challengeは「この表の人を予測する」という指定です。
# type = "response"にすると、結果は0〜1の確率になります。
probability <- predict(
  model,
  newdata = challenge,
  type = "response"
)

# probabilityには、challengeの270人分の確率が元の行順で保存されました。
# たとえば0.72は「この規則では生存確率を72%と見積もった」という意味です。
# 0.72だから必ず生存する、という意味ではありません。


# STEP 3：270個の確率を提出用の0/1へ変える -----------------------------
# ifelse()は同じ判断を270人へまとめて行います。
# 確率が0.5以上なら1、0.5未満なら0にします。
prediction <- ifelse(probability >= 0.5, 1, 0)

# predictionにはchallengeの270人分の0/1が、同じ行順で保存されました。
# 0.5は自然法則ではなく、Round 1で使う判断の境界です。


# 提出用の補助処理：Webサイトが自動で行う部分 ----------------------------
# ここから下は学生が書き換える部分ではありません。
# 授業用Webサイトでは、STEP 3が終わると同じ処理が自動で行われます。
#
# PassengerIdは、採点時に「どの乗客への予測か」を照合するための番号です。
# 回帰分析の手がかりには使いません。番号とpredictionを対応させる作業は、
# サイトが自動で行います。
submission <- data.frame(
  PassengerId = challenge$PassengerId,
  Survived = prediction
)

write.csv(
  submission,
  "output/titanic_submission.csv",
  row.names = FALSE
)


# ROUND 2：判断の境界だけを一度変える ------------------------------------
# Round 1を提出したら、STEP 3の0.5を0.6へ変えます。
#
#   prediction <- ifelse(probability >= 0.6, 1, 0)
#
# その後、STEP 3と「提出用の補助処理」だけをもう一度実行します。
# modelもprobabilityも同じなので、STEP 1とSTEP 2を作り直す必要はありません。
# scoreが変わった理由を、「1と判断する条件を厳しくしたから」と説明できるか
# 確かめます。
