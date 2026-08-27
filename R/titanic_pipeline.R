# DSC3010J 第3回
# Titanic-inspired classroom competition：学生用の基本pipeline
#
# このデータは授業用に作った合成データで、実在の乗客記録ではありません。
# このファイルは、公開repositoryの一番上のフォルダから実行してください。
# 「#」から右は人間向けの説明です。Rはコメントとして読み飛ばします。


# 今日の問い ----------------------------------------------------------------
# trainの630人から規則を学び、正解を隠したchallengeの270人を予測します。
# Survivedは、0が非生存、1が生存を表します。
# 最後に、PassengerIdと0/1予測を並べた提出CSVを作ります。


# 準備：二つのCSVを読み込む --------------------------------------------------
# read.csv()は、CSVファイルをRの表（data frame）として読み込む関数です。
# na.strings = ""は、CSVの空欄を欠損値NAとして読むための指定です。
train <- read.csv(
  "data/raw/titanic_train.csv",
  na.strings = ""
)

# challengeも同じ方法で読み込みます。challengeには正解のSurvived列がありません。
challenge <- read.csv(
  "data/raw/titanic_challenge.csv",
  na.strings = ""
)


# 問01：二つの表の人数を確かめる --------------------------------------------
# nrow(表)は、その表の行数を一つ返します。今回は1行が乗客1人です。
nrow(train)

# challengeについても同じ確認をします。
nrow(challenge)

# 予想する出力：trainは630、challengeは270です。
# 出力の[1]は「1番目の値から表示」というRの印で、問番号ではありません。


# 問02：列の名前を確かめる --------------------------------------------------
# names(表)は、その表にある列名をベクトルとして返します。
names(train)

# Pclass、Sex、Age、Survivedがあるか、つづりも含めて確認します。


# 問03：何もしない予測の基準点を置く ----------------------------------------
# Survivedは0/1なので、その平均は「1が占める割合」になります。
survival_rate <- mean(train$Survived)

# 保存した値を画面に表示します。約0.505、つまり約50.5%になるはずです。
survival_rate

# trainでは1がわずかに多いため、全員を1と答えるだけでも約51.1%です。
# これを、予測モデルが超えたい最初の基準点にします。


# 問04：Ageの欠損を数え、今回は使わないと決める ------------------------------
# $は表から列を1本取り出します。train$Ageは630人分の年齢ベクトルです。
# is.na()は、年齢がNAならTRUE、値があればFALSEを同じ順番で返します。
age_is_missing <- is.na(train$Age)

# sum()はTRUEを1として足すため、AgeがNAの人数を数えられます。
sum(age_is_missing)

# 53人のAgeが欠けています。埋め方はまだ学んでいないため、
# Round 1ではAgeを使わず、欠損のないPclassとSexだけを使います。


# 問05：Pclassを「量」ではなく「区分」にする -------------------------------
# c()で、1等・2等・3等という三つのラベルを一つのベクトルにします。
class_levels <- c(1, 2, 3)

# factor()は、数字を計算上の量ではなくカテゴリーとして扱う関数です。
# trainとchallengeの両方へ、同じ三つの区分を設定します。
train$Pclass <- factor(train$Pclass, levels = class_levels)
challenge$Pclass <- factor(challenge$Pclass, levels = class_levels)

# levels()で、設定された区分を確認します。"1" "2" "3"と表示されます。
levels(train$Pclass)


# 問06：モデルより先に、SexとSurvivedの人数表を見る -------------------------
# table(行, 列)は、二つのカテゴリーを組み合わせた人数表を作ります。
# 下の表では、行がSex、列がSurvivedの0/1になります。
sex_by_answer <- table(train$Sex, train$Survived)

# 作った人数表を表示し、femaleとmaleで1の割合が違うかを確認します。
sex_by_answer

# この表で分かるのは「関係」であり、Sexが生存の「原因」という意味ではありません。


# 問07：trainから、0/1用の予測規則を学ぶ -----------------------------------
# glm()は、指定したformulaに合う予測規則をtrainから学ぶ関数です。
# formulaの「~」は左を右で予測し、「+」は手がかりを追加する記号です。
# ここでの「+」は、Pclassの値とSexの値を足す計算ではありません。
model <- glm(
  Survived ~ Pclass + Sex,
  data = train,
  family = binomial()
)

# data = trainは学習に使う表、family = binomial()は答えが0/1という指定です。
# model <- で規則を保存した行は、成功しても画面に結果を表示しません。
# nobs()で、規則を学ぶのに使えた人数が630人かを確認します。
nobs(model)


# 問08：challengeの確率を出し、提出用の0/1へ変える --------------------------
# predict()は、問07で学んだmodelを新しい表の各行へ適用する関数です。
# newdata = challengeは予測する表、type = "response"は0〜1の確率を返す指定です。
probability <- predict(
  model,
  newdata = challenge,
  type = "response"
)

# 270個の確率をそれぞれ0.5と比較します。
# ifelse(条件, TRUEのとき, FALSEのとき)で、TRUEを1、FALSEを0へ変えます。
prediction <- ifelse(probability >= 0.5, 1, 0)

# head()は先頭の6人だけを表示します。まず確率を確認します。
head(probability)

# 同じ6人について、0/1へ変換された予測を確認します。
head(prediction)

# 0.5は自然法則ではなく、今回の提出で使う判断の境界です。


# 問09：PassengerIdと予測を結び、提出CSVを作る -----------------------------
# data.frame()は、同じ長さのベクトルを列として並べ、新しい表を作ります。
# challengeの行順を変えず、PassengerIdとpredictionを一人ずつ対応させます。
submission <- data.frame(
  PassengerId = challenge$PassengerId,
  Survived = prediction
)

# head()で提出表の先頭6行を確認します。
head(submission)

# write.csv()は表をCSVファイルとして保存する関数です。
# row.names = FALSEは、提出に不要なRの行番号をCSVへ付けない指定です。
write.csv(
  submission,
  "output/titanic_submission.csv",
  row.names = FALSE
)

# output/titanic_submission.csvがRound 1の提出ファイルです。


# ROUND 2：一つの仮説だけを試す --------------------------------------------
# 公式提出は2回までです。最初のscoreを見たあと、次のどれか一つだけを選びます。
#
# 選択肢A：問07のformulaの右側へ、変数を一つだけ追加する。
#
#   Survived ~ Pclass + Sex + Fare
#   Survived ~ Pclass + Sex + SibSp
#   Survived ~ Pclass + Sex + Parch
#
# 選択肢B：問08の判断境界0.5を、0.4または0.6へ一度だけ変える。
#
# 変更する前に、DECISIONS.mdへ「何を変えるか」「なぜか」「scoreの予想」を書きます。
# 変数を追加した場合は、問07、問08、問09を順にもう一度実行します。
# 境界だけを変えた場合は、問08、問09を順にもう一度実行します。
# scoreが上がっても、下がっても、同じでも、その結果と理由を記録します。
#
# 変数を増やせば必ずscoreが上がるわけではありません。
# 今回はAge補完、交互作用、summary(model)の読み方は扱いません。
